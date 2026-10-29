// Duplicate companies and people already in the CRM (migration 0141), shown on
// My Desk as "Same company?" / "Same person?". Different = the pair never comes
// back. Same = everything moves to the one kept and the other is ARCHIVED,
// never deleted. Rows the merge does not move (sales expenses, market signals,
// playbooks and the like) stay on the archived record, so nothing is lost.
import { normalizeName } from '@/lib/market-intel/normalizer.js';
import { archiveData } from '@/lib/archive';

// Shared mail hosts say nothing about who someone works for.
const MAIL_HOSTS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'msn.com', 'live.com', 'me.com', 'comcast.net']);

export const pairKey = (a, b) => (a < b ? [a, b] : [b, a]);

function domainsOf(raw) {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.map(d => String(d).toLowerCase().trim()).filter(d => d && !MAIL_HOSTS.has(d)) : []; }
  catch { return []; }
}

// Pairs from groups: every record in a group of look-alikes against the first.
function pairsFromGroups(groups, why, out) {
  for (const [key, ids] of groups) {
    const uniq = [...new Set(ids)];
    for (let i = 1; i < uniq.length; i++) {
      const [a, b] = pairKey(uniq[0], uniq[i]);
      const k = `${a}|${b}`;
      if (!out.has(k)) out.set(k, { aId: a, bId: b, why: why(key) });
    }
  }
}

function group(rows, keyOf) {
  const m = new Map();
  for (const r of rows) for (const k of keyOf(r)) { if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r.id); }
  return [...m].filter(([, ids]) => new Set(ids).size > 1);
}

/** Open "Same company?" and "Same person?" questions, oldest answers left out. */
export async function findCrmDuplicates(prisma, { limit = 40 } = {}) {
  const decided = await prisma.crmMergeDecision.findMany({ select: { kind: true, aId: true, bId: true } });
  const done = new Set(decided.map(d => `${d.kind}|${d.aId}|${d.bId}`));

  const clients = await prisma.client.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, type: true, emailDomains: true, branchMarket: true, parentClientId: true,
      _count: { select: { contacts: true, projects: true } } },
  });
  const cPairs = new Map();
  pairsFromGroups(group(clients, c => [normalizeName(c.name)]), () => 'Almost the same name', cPairs);
  pairsFromGroups(group(clients, c => domainsOf(c.emailDomains)), d => `Both use the email domain ${d}`, cPairs);
  const byClient = new Map(clients.map(c => [c.id, c]));
  const companyPairs = [...cPairs.values()]
    .filter(p => !done.has(`client|${p.aId}|${p.bId}`))
    // A national company and its own branch share a name on purpose.
    .filter(p => byClient.get(p.aId).parentClientId !== p.bId && byClient.get(p.bId).parentClientId !== p.aId)
    .slice(0, limit)
    .map(p => ({ kind: 'client', ...p, a: byClient.get(p.aId), b: byClient.get(p.bId) }));

  const contacts = await prisma.contact.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, email: true, title: true, clientId: true, client: { select: { name: true } } },
  });
  const pPairs = new Map();
  pairsFromGroups(group(contacts, c => [c.email?.toLowerCase().trim()]), e => `Same email ${e}`, pPairs);
  pairsFromGroups(group(contacts, c => (c.clientId && c.name ? [`${c.clientId}|${c.name.toLowerCase().replace(/\s+/g, ' ').trim()}`] : [])),
    () => 'Same name at the same company', pPairs);
  const byContact = new Map(contacts.map(c => [c.id, c]));
  const peoplePairs = [...pPairs.values()]
    .filter(p => !done.has(`contact|${p.aId}|${p.bId}`))
    .slice(0, limit)
    .map(p => ({ kind: 'contact', ...p, a: byContact.get(p.aId), b: byContact.get(p.bId) }));

  return { companies: companyPairs, people: peoplePairs };
}

export async function recordDifferent(prisma, kind, x, y, user) {
  const [aId, bId] = pairKey(x, y);
  return prisma.crmMergeDecision.upsert({
    where: { kind_aId_bId: { kind, aId, bId } },
    create: { kind, aId, bId, decision: 'DIFFERENT', decidedById: user?.id || null },
    update: { decision: 'DIFFERENT', survivorId: null, decidedById: user?.id || null },
  });
}

// Move link rows that carry a unique (owner, other) pair: rows the kept record
// already has are left on the archived one instead of breaking the unique rule.
async function moveLinks(tx, model, ownerField, otherField, fromId, toId) {
  const have = new Set((await tx[model].findMany({ where: { [ownerField]: toId }, select: { [otherField]: true } })).map(r => r[otherField]));
  const rows = await tx[model].findMany({ where: { [ownerField]: fromId }, select: { id: true, [otherField]: true } });
  const move = rows.filter(r => !have.has(r[otherField])).map(r => r.id);
  if (move.length) await tx[model].updateMany({ where: { id: { in: move } }, data: { [ownerField]: toId } });
  return move.length;
}

const SEATS = ['clientId', 'developerId', 'generalContractorId', 'electricalContractorId', 'interiorDesignerId', 'electricalEngineerId', 'architectId'];

/** Same company: keep `keepId`, move its people, jobs, notes, tags and aliases, archive `goneId`. */
export async function mergeClients(prisma, keepId, goneId, user) {
  return prisma.$transaction(async tx => {
    const keep = await tx.client.findUnique({ where: { id: keepId } });
    const gone = await tx.client.findUnique({ where: { id: goneId }, include: { aliases: true } });
    if (!keep || !gone || keep.archivedAt || gone.archivedAt) throw new Error('MERGE_GONE');
    const moved = {};
    moved.people = (await tx.contact.updateMany({ where: { clientId: goneId }, data: { clientId: keepId } })).count;
    moved.jobs = 0;
    for (const seat of SEATS) moved.jobs += (await tx.project.updateMany({ where: { [seat]: goneId }, data: { [seat]: keepId } })).count;
    moved.notes = await moveLinks(tx, 'noteClient', 'clientId', 'noteId', goneId, keepId);
    moved.tags = await moveLinks(tx, 'clientTagLink', 'clientId', 'tagId', goneId, keepId);
    // Branches follow only when the kept company is not itself a branch (one level).
    if (!keep.parentClientId) moved.branches = (await tx.client.updateMany({ where: { parentClientId: goneId, id: { not: keepId } }, data: { parentClientId: keepId } })).count;

    // The archived name, and its own aliases, become aliases of the kept company.
    const haveAlias = new Set((await tx.clientAlias.findMany({ where: { clientId: keepId }, select: { normalizedAlias: true } })).map(a => a.normalizedAlias));
    haveAlias.add(normalizeName(keep.name));
    for (const name of [gone.name, ...gone.aliases.map(a => a.aliasName)]) {
      const n = normalizeName(name);
      if (!n || haveAlias.has(n)) continue;
      haveAlias.add(n);
      await tx.clientAlias.create({ data: { clientId: keepId, aliasName: name, normalizedAlias: n, createdById: user.id } });
    }
    const domains = [...new Set([...domainsOfRaw(keep.emailDomains), ...domainsOfRaw(gone.emailDomains)])];
    await tx.client.update({ where: { id: keepId }, data: { emailDomains: JSON.stringify(domains) } });
    await tx.client.update({ where: { id: goneId }, data: archiveData(true, user) });

    const [aId, bId] = pairKey(keepId, goneId);
    await tx.crmMergeDecision.upsert({
      where: { kind_aId_bId: { kind: 'client', aId, bId } },
      create: { kind: 'client', aId, bId, decision: 'MERGED', survivorId: keepId, decidedById: user.id },
      update: { decision: 'MERGED', survivorId: keepId, decidedById: user.id },
    });
    return moved;
  });
}

function domainsOfRaw(raw) {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.map(d => String(d).toLowerCase().trim()).filter(Boolean) : []; }
  catch { return []; }
}

const FILL = ['title', 'phone', 'workPhone', 'cellPhone', 'linkedInUrl', 'department', 'clientId', 'preferredName', 'firstName', 'lastName'];

/** Same person: keep `keepId`, move jobs, notes, emails, tags, history; fill its blanks; archive `goneId`. */
export async function mergeContacts(prisma, keepId, goneId, user) {
  return prisma.$transaction(async tx => {
    const keep = await tx.contact.findUnique({ where: { id: keepId } });
    const gone = await tx.contact.findUnique({ where: { id: goneId }, include: { otherEmails: true } });
    if (!keep || !gone || keep.archivedAt || gone.archivedAt) throw new Error('MERGE_GONE');
    const moved = {};
    moved.jobs = await moveLinks(tx, 'projectContact', 'contactId', 'projectId', goneId, keepId);
    moved.notes = await moveLinks(tx, 'noteContact', 'contactId', 'noteId', goneId, keepId);
    moved.emails = await moveLinks(tx, 'emailContactLink', 'contactId', 'messageId', goneId, keepId);
    moved.tags = await moveLinks(tx, 'contactTagLink', 'contactId', 'tagId', goneId, keepId);
    await tx.contactEmployment.updateMany({ where: { contactId: goneId }, data: { contactId: keepId } });
    await tx.contactPersonalFact.updateMany({ where: { contactId: goneId }, data: { contactId: keepId } });

    // Blanks on the kept person are filled from the other one, never overwritten.
    const fill = {};
    for (const f of FILL) if ((keep[f] == null || keep[f] === '') && gone[f] != null && gone[f] !== '') fill[f] = gone[f];
    if (Object.keys(fill).length) await tx.contact.update({ where: { id: keepId }, data: fill });

    // Their other addresses ride along as extra emails.
    let main = (keep.email || '').toLowerCase().trim();
    const have = new Set((await tx.contactEmail.findMany({ where: { contactId: keepId }, select: { email: true } })).map(e => e.email));
    for (const raw of [gone.email, ...gone.otherEmails.map(e => e.email)]) {
      const e = (raw || '').toLowerCase().trim();
      if (!e || e === main || have.has(e)) continue;
      have.add(e);
      if (!main) { main = e; await tx.contact.update({ where: { id: keepId }, data: { email: e } }); continue; }
      await tx.contactEmail.create({ data: { contactId: keepId, email: e } });
    }
    await tx.contact.update({ where: { id: goneId }, data: archiveData(true, user) });

    const [aId, bId] = pairKey(keepId, goneId);
    await tx.crmMergeDecision.upsert({
      where: { kind_aId_bId: { kind: 'contact', aId, bId } },
      create: { kind: 'contact', aId, bId, decision: 'MERGED', survivorId: keepId, decidedById: user.id },
      update: { decision: 'MERGED', survivorId: keepId, decidedById: user.id },
    });
    return moved;
  });
}
