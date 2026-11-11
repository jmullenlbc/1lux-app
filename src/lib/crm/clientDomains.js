/**
 * Which company does an email domain belong to?
 *
 * Built from Client.emailDomains (a JSON list, authoritative), Client.website
 * (its host) and, as a last resort, the domains of the people already filed
 * under that company. Free mail providers never count as a company.
 *
 * Relative imports only, so the tests can load this without the app alias.
 */
import { FREE_EMAIL_DOMAINS, parseEmailDomain } from '../intake.js';

export { FREE_EMAIL_DOMAINS, parseEmailDomain };

/** Our own domains. People here are staff, never introductions or contacts. */
export const OUR_DOMAINS = new Set(['ilcstudios.com', '1lux.lighting', 'logiqsupply.com']);

export function hostOfWebsite(url) {
  return String(url ?? '').trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
}

export function isFreeMailDomain(domain, freeMailDomains = FREE_EMAIL_DOMAINS) {
  const d = String(domain ?? '').trim().toLowerCase();
  return Boolean(d) && freeMailDomains.has(d);
}

/**
 * Pure: clients [{ id, emailDomains, website }] and contacts [{ email, clientId }]
 * into a Map domain -> clientId. Explicit emailDomains win over website hosts,
 * which win over domains derived from the people at that company.
 */
export function buildClientDomainMap(clients = [], contacts = [], freeMailDomains = FREE_EMAIL_DOMAINS) {
  const map = new Map();
  const put = (domain, clientId) => {
    const d = String(domain ?? '').trim().toLowerCase();
    if (!d || !clientId || map.has(d) || freeMailDomains.has(d) || OUR_DOMAINS.has(d)) return;
    map.set(d, clientId);
  };
  const listOf = c => {
    if (Array.isArray(c.emailDomains)) return c.emailDomains;
    try { return JSON.parse(c.emailDomains || '[]'); } catch { return []; }
  };
  for (const c of clients) for (const d of listOf(c)) put(d, c.id);
  for (const c of clients) put(hostOfWebsite(c.website), c.id);
  for (const p of contacts) if (p?.clientId) put(parseEmailDomain(p.email), p.clientId);
  return map;
}

/** The map above, loaded from the database. */
export async function loadClientDomainMap(prisma) {
  const [clients, contacts] = await Promise.all([
    prisma.client.findMany({ select: { id: true, emailDomains: true, website: true } }),
    prisma.contact.findMany({ where: { email: { not: null }, clientId: { not: null } }, select: { email: true, clientId: true } }),
  ]);
  return buildClientDomainMap(clients, contacts);
}

/** The company an address most likely belongs to, or null. */
export function guessClientIdForEmail(email, clientDomains) {
  const domain = parseEmailDomain(email);
  if (!domain || !clientDomains) return null;
  return clientDomains.get(domain) ?? null;
}
