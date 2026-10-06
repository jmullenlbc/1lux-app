/**
 * Introductions: a person we do not know, on an email or an invite together
 * with someone we do know, whose address belongs to a company we work with.
 *
 * Assumed definition (Maram to confirm, 2026-10-05):
 *   - at least one known contact is on the message or the invite, AND
 *   - another address on it is unknown to us AND its domain matches a Client
 *     (Client.emailDomains, its website host, or the domains of its people).
 * Free mail domains (gmail, yahoo, outlook, ...) never count as a company.
 * Our own staff are never introductions.
 *
 * The detector is pure. The recorder never fails the email or calendar save.
 * Relative imports only, so the tests can load this without the app alias.
 */
import { normalizeAddress } from '../email/classify.js';
import {
  FREE_EMAIL_DOMAINS, OUR_DOMAINS, buildClientDomainMap, parseEmailDomain,
} from '../crm/clientDomains.js';

/**
 * @param addresses       [{ email, name }] everyone on the message or invite
 * @param knownByEmail    Map lowercased email -> { contactId, clientId }
 * @param clientDomains   Map domain -> clientId
 * @param freeMailDomains Set of domains that are never a company
 * @param ourDomains      Set of our own domains (staff, skipped)
 * @returns [{ introducedEmail, introducedName, clientId, introducedByContactId }]
 */
export function detectIntroductions({
  addresses = [], knownByEmail = new Map(), clientDomains = new Map(),
  freeMailDomains = FREE_EMAIL_DOMAINS, ourDomains = OUR_DOMAINS,
} = {}) {
  const people = [];
  const seen = new Set();
  for (const a of addresses) {
    const email = normalizeAddress(typeof a === 'string' ? a : a?.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    people.push({ email, name: (typeof a === 'string' ? '' : a?.name) || null });
  }

  const known = people
    .map(p => ({ ...p, ...(knownByEmail.get(p.email) || {}) }))
    .filter(p => p.contactId);
  if (known.length === 0) return [];

  const out = [];
  for (const p of people) {
    if (knownByEmail.has(p.email)) continue;
    const domain = parseEmailDomain(p.email);
    if (!domain || freeMailDomains.has(domain) || ourDomains.has(domain)) continue;
    const clientId = clientDomains.get(domain);
    if (!clientId) continue;
    // Whoever introduced them: a known person at that same company first,
    // otherwise the first known person on it.
    const by = known.find(k => k.clientId === clientId) || known[0];
    out.push({
      introducedEmail:       p.email,
      introducedName:        p.name,
      clientId,
      introducedByContactId: by.contactId,
    });
  }
  return out;
}

/**
 * Save candidates, one row per (introducedEmail, source). A re-sync updates
 * the row it already wrote. Never throws.
 *
 * @param source { kind: 'email' | 'calendar', sourceMessageId?, sourceCalendarRef?, detectedAt?, introducedByUserId? }
 */
export async function recordIntroductions(prisma, candidates = [], source = {}) {
  if (!prisma?.introduction || !candidates.length) return [];
  const ids = [];
  const sourceWhere = source.sourceMessageId
    ? { sourceMessageId: source.sourceMessageId }
    : { sourceCalendarRef: source.sourceCalendarRef || null };
  for (const c of candidates) {
    try {
      const data = {
        kind:                  source.kind || (source.sourceMessageId ? 'email' : 'calendar'),
        introducedEmail:       c.introducedEmail,
        introducedName:        c.introducedName ?? null,
        introducedByContactId: c.introducedByContactId ?? null,
        introducedByUserId:    source.introducedByUserId ?? null,
        clientId:              c.clientId ?? null,
        sourceMessageId:       source.sourceMessageId ?? null,
        sourceCalendarRef:     source.sourceCalendarRef ?? null,
        detectedAt:            source.detectedAt ? new Date(source.detectedAt) : new Date(),
      };
      const existing = await prisma.introduction.findFirst({
        where:  { introducedEmail: c.introducedEmail, ...sourceWhere },
        select: { id: true, status: true },
      });
      if (existing) {
        // A decided row keeps its decision; only the facts refresh.
        await prisma.introduction.update({ where: { id: existing.id }, data: { introducedName: data.introducedName, clientId: data.clientId, introducedByContactId: data.introducedByContactId } });
        ids.push(existing.id);
      } else {
        const made = await prisma.introduction.create({ data, select: { id: true } });
        ids.push(made.id);
      }
    } catch (err) {
      console.error('[introductions] could not record:', err?.message || err);
    }
  }
  return ids;
}

/**
 * The whole thing for one message or invite: look up who we know, build the
 * company domain map, detect, record. Never throws.
 */
export async function recordIntroductionsForAddresses(prisma, addresses = [], source = {}) {
  try {
    if (!prisma?.introduction || !addresses.length) return [];
    const [contacts, clients] = await Promise.all([
      prisma.contact.findMany({ where: { email: { not: null } }, select: { id: true, email: true, clientId: true } }),
      prisma.client.findMany({ select: { id: true, emailDomains: true, website: true } }),
    ]);
    const knownByEmail = new Map();
    for (const c of contacts) {
      const key = normalizeAddress(c.email);
      if (key && !knownByEmail.has(key)) knownByEmail.set(key, { contactId: c.id, clientId: c.clientId ?? null });
    }
    const clientDomains = buildClientDomainMap(clients, contacts);
    const candidates = detectIntroductions({ addresses, knownByEmail, clientDomains });
    return recordIntroductions(prisma, candidates, source);
  } catch (err) {
    console.error('[introductions] detection failed:', err?.message || err);
    return [];
  }
}
