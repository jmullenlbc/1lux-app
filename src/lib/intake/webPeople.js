/**
 * A web budget's company and person become real CRM records the moment the
 * budget is started (Mike, 2026-10-04: "the client needs to be created upon a
 * budget being made or started"). A look alike is never made twice and never
 * joined on a guess: it waits on My Desk as "Same person?" (sameWho.js).
 *
 * When the budget becomes a project, the company and person go onto it, and
 * the project goes to whoever already looks after that person or company.
 * Nobody yet means it sits in the web budget pool on My Desk until somebody
 * takes it.
 *
 * Server only. Every caller treats a failure here as non-fatal.
 */
import { matchPerson, matchCompany } from '@/lib/intake/sameWho';
import { notifyUsers } from '@/lib/alerts';
import { inDepartment, SALES_MARKETING } from '@/lib/departments';

export async function salesIds(db) {
  const sales = await db.user.findMany({ where: { isActive: true, ...inDepartment(SALES_MARKETING) }, select: { id: true } });
  return sales.map(u => u.id);
}

export async function createWebClient(db, { name, domain, creatorId }) {
  const agg = await db.client.aggregate({ _max: { clientNumber: true } });
  return db.client.create({
    data: {
      clientNumber: (agg._max.clientNumber ?? 0) + 1,
      name: String(name).trim().slice(0, 200),
      emailDomains: domain ? JSON.stringify([domain]) : undefined,
      createdById: creatorId,
    },
    select: { id: true, name: true },
  });
}

export async function createWebContact(db, { firstName, lastName, email, companyName, clientId }) {
  const agg = await db.contact.aggregate({ _max: { contactNumber: true } });
  const first = String(firstName ?? '').trim(), last = String(lastName ?? '').trim();
  return db.contact.create({
    data: {
      contactNumber: (agg._max.contactNumber ?? 0) + 1,
      name: [first, last].filter(Boolean).join(' ') || String(email ?? 'Web visitor'),
      firstName: first || null,
      lastName: last || null,
      email: email ? String(email).trim().toLowerCase() : null,
      company: companyName || null,
      clientId: clientId || null,
    },
    select: { id: true, name: true },
  });
}

/** One question per look alike: the same question already waiting is not asked again. */
export async function askOnce(db, data) {
  const already = await db.duplicateReview.findFirst({
    where: {
      kind: data.kind, status: 'PENDING',
      existingContactId: data.existingContactId ?? null,
      existingClientId: data.existingClientId ?? null,
      existingProjectId: data.existingProjectId ?? null,
      ...(data.kind === 'contact' ? { email: data.email ?? null } : {}),
      ...(data.kind === 'client' ? { companyName: data.companyName ?? null } : {}),
      ...(data.kind === 'project' ? { draftId: data.draftId ?? null, submissionId: data.submissionId ?? null } : {}),
    },
    select: { id: true },
  });
  if (already) return null;
  return db.duplicateReview.create({ data, select: { id: true, kind: true } });
}

/** Tell Sales there are look alikes to answer. */
export async function tellSalesAboutReviews(db, reviews, who) {
  const asked = (reviews || []).filter(Boolean);
  if (!asked.length) return;
  const what = asked.map(r => ({ contact: 'same person', client: 'same company', project: 'same job' }[r.kind])).join(' and ');
  await notifyUsers(await salesIds(db), {
    type: 'DUPLICATE_REVIEW',
    title: asked.length === 1
      ? `Same ${{ contact: 'person', client: 'company', project: 'job' }[asked[0].kind]}? ${who}`
      : `Look alikes to check: ${who}`,
    message: `A web budget from ${who} looks like one we already have (${what}). Answer on My Desk; nothing is joined until somebody does.`,
    link: '/sales/desk#look-alikes',
    dedupeKey: `duplicate-review:${asked[0].id}`,
  }, { db });
}

/**
 * Find or make the company and person behind a web budget.
 * Returns { clientId, contactId, reviews }. A look alike leaves that id null
 * and adds a question instead.
 */
export async function settleWebPerson(db, input, { creatorId, clientId: knownClientId = null } = {}) {
  const { firstName, lastName, email, companyName, emailDomain, draftId = null, submissionId = null, projectName = null } = input;
  const base = {
    firstName: firstName || null, lastName: lastName || null, email: email ? String(email).toLowerCase() : null,
    companyName: companyName || null, emailDomain: emailDomain || null, projectName, draftId, submissionId,
  };
  const reviews = [];

  let clientId = knownClientId;
  if (!clientId) {
    const clients = await db.client.findMany({ select: { id: true, name: true, emailDomains: true, website: true } });
    const m = matchCompany({ companyName, emailDomain }, clients);
    if (m.action === 'link') clientId = m.client.id;
    else if (m.action === 'review') reviews.push(await askOnce(db, { ...base, kind: 'client', existingClientId: m.client.id, reason: m.reason }));
    else if (companyName && creatorId) clientId = (await createWebClient(db, { name: companyName, domain: emailDomain, creatorId })).id;
  }

  let contactId = null;
  const contacts = await db.contact.findMany({ select: { id: true, name: true, firstName: true, lastName: true, email: true, clientId: true } });
  const p = matchPerson({ firstName, lastName, email }, contacts);
  if (p.action === 'link') {
    contactId = p.contact.id;
    if (clientId && !p.contact.clientId) await db.contact.update({ where: { id: contactId }, data: { clientId } });
  } else if (p.action === 'review') {
    reviews.push(await askOnce(db, { ...base, kind: 'contact', existingContactId: p.contact.id, reason: p.reason }));
  } else {
    contactId = (await createWebContact(db, { firstName, lastName, email, companyName, clientId })).id;
  }
  return { clientId, contactId, reviews: reviews.filter(Boolean) };
}

/**
 * Put the company and person on a project, the person as its lead, and give
 * the project to whoever already looks after them (the person's owner first,
 * then the company's). Never replaces anything already set.
 * Returns the sales owner it gave the project to, or null.
 */
export async function linkPeopleToProject(db, projectId, { clientId = null, contactId = null } = {}) {
  if (!projectId || (!clientId && !contactId)) return null;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { clientId: true, salesOwnerId: true } });
  if (!project) return null;
  const data = {};
  if (clientId && !project.clientId) data.clientId = clientId;
  if (contactId) {
    const lead = await db.projectContact.findFirst({ where: { projectId, isLead: true }, select: { id: true } });
    await db.projectContact.upsert({
      where: { projectId_contactId: { projectId, contactId } },
      create: { projectId, contactId, isLead: !lead },
      update: {},
    });
  }
  let assigned = null;
  if (!project.salesOwnerId) {
    const [contact, client] = await Promise.all([
      contactId ? db.contact.findUnique({ where: { id: contactId }, select: { owner: { select: { id: true, isActive: true } } } }) : null,
      (clientId || project.clientId) ? db.client.findUnique({ where: { id: clientId || project.clientId }, select: { owner: { select: { id: true, isActive: true } } } }) : null,
    ]);
    const owner = [contact?.owner, client?.owner].find(o => o?.isActive);
    if (owner) { data.salesOwnerId = owner.id; assigned = owner.id; }
  }
  if (Object.keys(data).length) await db.project.update({ where: { id: projectId }, data });
  return assigned;
}
