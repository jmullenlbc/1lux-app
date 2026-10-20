// Who opened a Sales Docs link, in CRM terms (0137).
//   EMAIL   the address is a person we have
//   DOMAIN  a work domain one of our companies uses
//   NONE    neither (or a free mail address, which says nothing about a company)
// Forwarded = the link was made for one address and someone else opened it.

export const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
]);

export function normalizeEmail(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

export function emailDomain(email) {
  const e = normalizeEmail(email);
  return e ? e.split('@')[1] : null;
}

export const isFreemail = (domain) => !!domain && FREEMAIL.has(String(domain).toLowerCase());

/** Host of a website field, without www. */
export function websiteDomain(url) {
  const s = String(url ?? '').trim().toLowerCase();
  if (!s) return null;
  try {
    const host = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname;
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Opened by someone other than the person the link was made for? */
export function isForwarded(recipientEmail, visitorEmail) {
  const a = normalizeEmail(recipientEmail);
  const b = normalizeEmail(visitorEmail);
  return !!(a && b && a !== b);
}

/**
 * Pure match, given the people and companies to look through.
 * @param {string} email
 * @param {{ contacts: Array<{id,email,clientId}>, clients: Array<{id,email,website}> }} pool
 */
export function matchFromPool(email, { contacts = [], clients = [] } = {}) {
  const e = normalizeEmail(email);
  if (!e) return { matchType: 'NONE', contactId: null, clientId: null, domain: null };
  const domain = e.split('@')[1];

  const person = contacts.find((c) => normalizeEmail(c.email) === e);
  if (person) return { matchType: 'EMAIL', contactId: person.id, clientId: person.clientId || null, domain };
  if (isFreemail(domain)) return { matchType: 'NONE', contactId: null, clientId: null, domain };

  // The company most of our people at this domain work for.
  const counts = new Map();
  for (const c of contacts) {
    if (c.clientId && emailDomain(c.email) === domain) counts.set(c.clientId, (counts.get(c.clientId) || 0) + 1);
  }
  let best = null;
  for (const [id, n] of counts) if (!best || n > best[1]) best = [id, n];
  if (best) return { matchType: 'DOMAIN', contactId: null, clientId: best[0], domain };

  const company = clients.find((c) => emailDomain(c.email) === domain || websiteDomain(c.website) === domain);
  if (company) return { matchType: 'DOMAIN', contactId: null, clientId: company.id, domain };
  return { matchType: 'NONE', contactId: null, clientId: null, domain };
}

/**
 * Look the address up. Compared in JS because Prisma's case-insensitive mode
 * is Postgres only and this codebase also runs on SQLite locally.
 */
export async function matchVisitor(prisma, email) {
  const e = normalizeEmail(email);
  if (!e) return matchFromPool(null);
  const domain = e.split('@')[1];
  const contacts = await prisma.contact.findMany({
    where: { email: { not: null }, archivedAt: null },
    select: { id: true, email: true, clientId: true },
  });
  const sameDomain = contacts.filter((c) => emailDomain(c.email) === domain);
  const clients = isFreemail(domain) ? [] : await prisma.client.findMany({
    where: { archivedAt: null, OR: [{ email: { not: null } }, { website: { not: null } }] },
    select: { id: true, email: true, website: true },
  });
  return matchFromPool(e, { contacts: sameDomain, clients });
}
