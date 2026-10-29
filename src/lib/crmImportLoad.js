// Server side of the CRM importer (Admin > CRM upload, Mike 10-28). The page
// sends the rows from src/lib/crmImport.js in small batches so no request
// comes near the 30 second wall.
//
// "Wipe" DELETES every project, company and person, archived ones too (Mike
// 10-28: "it should delete all data for projects, companies, and people only.
// Leave everything else."). There is no undo. What hangs off a project (files,
// budgets, matrices, status history) goes with it through the database's own
// cascades; notes stay and just lose the project link; expenses, market intel
// and the rest keep their row with the link emptied. Manufacturers and
// products are never touched. It runs a few dozen rows per request so no
// request comes near the 30 second wall; the page repeats it until done.
// Every load step finds before it creates, so a batch that is sent twice
// after a dropped connection adds nothing twice.
import { matchUser, IMPORT_TAG_NOTE } from '@/lib/crmImport';
import { createProject } from '@/lib/projects/createProject';
import { loadPricing } from '@/lib/pricingLoader';
import { normalizeName } from '@/lib/market-intel/normalizer.js';
import { INCLUDE_ARCHIVED } from '@/lib/archive';

const WIPE_KEY = 'crmImport.lastWipe';
const WIPED = ['project', 'contact', 'client'];
const WIPE_STEP = 40;
const low = v => String(v ?? '').trim().toLowerCase();

export async function importCounts(db) {
  const [projects, contacts, clients, manufacturers, products, users, last] = await Promise.all([
    // Archived rows count too: the wipe deletes them as well.
    ...WIPED.map(m => db[m].count({ where: { ...INCLUDE_ARCHIVED } })),
    db.manufacturer.count(), db.manufacturerProduct.count(),
    db.user.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    db.appSetting.findUnique({ where: { key: WIPE_KEY } }),
  ]);
  let lastWipe = null;
  try { lastWipe = last ? JSON.parse(last.value) : null; } catch { /* unreadable = none */ }
  return { projects, clients, contacts, manufacturers, products, users, lastWipe };
}

// One step of the wipe: deletes up to WIPE_STEP rows of the first table that
// still has any (projects, then people, then companies) and says how many are
// left. The last step writes who wiped and when.
export async function wipeStep(db, user) {
  for (const m of WIPED) {
    const ids = (await db[m].findMany({ where: { ...INCLUDE_ARCHIVED }, select: { id: true }, take: WIPE_STEP })).map(r => r.id);
    if (!ids.length) continue;
    // Notes would go with the project through the cascade; keep them, unlinked.
    if (m === 'project') await db.note.updateMany({ where: { projectId: { in: ids } }, data: { projectId: null } });
    const deleted = (await db[m].deleteMany({ where: { id: { in: ids } } })).count;
    const left = {};
    for (const n of WIPED) left[n] = await db[n].count({ where: { ...INCLUDE_ARCHIVED } });
    return { done: false, model: m, deleted, left };
  }
  const record = { stamp: new Date().toISOString(), byId: user.id, by: user.name || user.email };
  await db.appSetting.upsert({
    where: { key: WIPE_KEY },
    create: { key: WIPE_KEY, value: JSON.stringify(record), updatedById: user.id },
    update: { value: JSON.stringify(record), updatedById: user.id },
  });
  return { done: true, wipe: record };
}

// Top-level companies by lower-case name, so batches and retries find them.
async function companyIds(db) {
  const rows = await db.client.findMany({ where: { parentClientId: null }, select: { id: true, name: true } });
  return new Map(rows.map(r => [low(r.name), r.id]));
}

// Branches by "company|market", so a person with an office lands on it.
async function branchIds(db) {
  const rows = await db.client.findMany({
    where: { parentClientId: { not: null } },
    select: { id: true, branchMarket: true, parent: { select: { name: true } } },
  });
  return new Map(rows.filter(r => r.parent && r.branchMarket).map(r => [`${low(r.parent.name)}|${low(r.branchMarket)}`, r.id]));
}

export async function loadCompanies(db, user, rows) {
  const users = await db.user.findMany({ select: { id: true, name: true } });
  const have = await companyIds(db);
  let next = ((await db.client.aggregate({ _max: { clientNumber: true } }))._max.clientNumber ?? 0) + 1;
  let created = 0, branches = 0;
  for (const c of rows) {
    if (have.has(low(c.name))) continue;
    const owner = matchUser(users, c.owner);
    const base = {
      type: c.type,
      orgTypes: JSON.stringify(c.orgLabel ? [c.orgLabel] : []),
      emailDomains: JSON.stringify(c.domains || []),
      ownerId: owner?.id || null,
      createdById: user.id,
    };
    const parent = await db.client.create({
      data: {
        ...base, name: c.name, clientNumber: next++,
        locationType: c.markets?.length ? 'national' : 'standalone',
        notes: IMPORT_TAG_NOTE,
      },
    });
    have.set(low(c.name), parent.id);
    created++;
    const names = new Set([normalizeName(c.name)]);
    for (const a of c.aliases || []) {
      const n = normalizeName(a);
      if (!n || names.has(n)) continue;
      names.add(n);
      await db.clientAlias.create({ data: { clientId: parent.id, aliasName: a, normalizedAlias: n, createdById: user.id } });
    }
    for (const market of c.markets || []) {
      await db.client.create({
        data: { ...base, name: c.name, clientNumber: next++, locationType: 'localBranch', parentClientId: parent.id, branchMarket: market, city: market },
      });
      branches++;
    }
  }
  return { created, branches, skipped: rows.length - created };
}

export async function loadPeople(db, user, rows) {
  const companies = await companyIds(db);
  const branches = await branchIds(db);
  const emails = rows.map(p => p.email).filter(Boolean);
  const existing = await db.contact.findMany({
    where: { OR: [{ email: { in: emails } }, { name: { in: rows.map(p => p.name) } }] },
    select: { email: true, name: true, clientId: true },
  });
  const have = new Set(existing.flatMap(c => [low(c.email), `${low(c.name)}|${c.clientId || ''}`]).filter(Boolean));
  const tagIds = new Map();
  let next = ((await db.contact.aggregate({ _max: { contactNumber: true } }))._max.contactNumber ?? 0) + 1;
  let created = 0;
  const missingCompany = [];
  for (const p of rows) {
    const parentId = p.company ? companies.get(low(p.company)) || null : null;
    if (p.company && !parentId) missingCompany.push(p.name);
    // A person can sit on the parent (national office) or a branch (Mike 10-28).
    const clientId = (parentId && p.office && branches.get(`${low(p.company)}|${low(p.office)}`)) || parentId;
    if ((p.email && have.has(p.email)) || have.has(`${low(p.name)}|${clientId || ''}`)) continue;
    const c = await db.contact.create({
      data: {
        name: p.name, firstName: p.firstName, lastName: p.lastName,
        title: p.title, email: p.email, phone: p.phone, workPhone: p.phone,
        company: p.company, clientId, notes: p.notes,
        contactNumber: next++, createdById: user.id,
      },
    });
    created++;
    if (p.email) have.add(p.email);
    have.add(`${low(p.name)}|${clientId || ''}`);
    for (const e of p.otherEmails || []) {
      await db.contactEmail.upsert({ where: { contactId_email: { contactId: c.id, email: e } }, create: { contactId: c.id, email: e }, update: {} });
    }
    for (const t of p.tags || []) {
      if (!tagIds.has(t)) tagIds.set(t, (await db.contactTag.upsert({ where: { name: t }, create: { name: t }, update: {} })).id);
      await db.contactTagLink.create({ data: { contactId: c.id, tagId: tagIds.get(t) } });
    }
  }
  return { created, skipped: rows.length - created, missingCompany };
}

const NOTE_STATUSES = ['LOST', 'ABANDONED'];

export async function loadProjects(db, user, rows) {
  const users = await db.user.findMany({ select: { id: true, name: true } });
  const companies = await companyIds(db);
  const existing = await db.project.findMany({ where: { name: { in: rows.map(p => p.name) } }, select: { name: true, clientId: true } });
  const have = new Set(existing.map(p => `${low(p.name)}|${p.clientId || ''}`));
  const pricingSnapshot = JSON.stringify(await loadPricing());
  let created = 0;
  for (const p of rows) {
    const clientId = p.company ? companies.get(low(p.company)) || null : null;
    const key = `${low(p.name)}|${clientId || ''}`;
    if (have.has(key)) continue;
    const owner = matchUser(users, p.salesperson);
    await createProject(db, user.id, {
      name: p.name, clientId, phase: p.phase, serviceType: p.serviceType, pricingSnapshot,
      extra: {
        // No stage on the sheet = no phase (Mike 10-28), not the SD default.
        phase: p.phase || '',
        procurementStatus: p.procurementStatus,
        procurementStatusReason: NOTE_STATUSES.includes(p.procurementStatus) ? IMPORT_TAG_NOTE : null,
        designStatus: p.designStatus,
        designStatusReason: NOTE_STATUSES.includes(p.designStatus) ? IMPORT_TAG_NOTE : null,
        contractValue: p.contractValue,
        designContractValue: p.designContractValue,
        totalInvoiced: p.totalInvoiced,
        expectedOrderDate: p.expectedOrderDate ? new Date(p.expectedOrderDate) : null,
        salesOwnerId: owner?.id || null,
      },
      extraData: p.numUnits ? { numUnits: p.numUnits } : {},
    });
    have.add(key);
    created++;
  }
  return { created, skipped: rows.length - created };
}
