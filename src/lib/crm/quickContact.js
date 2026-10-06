/**
 * One-button "add this person" from an email address.
 *
 * The email is the person: an address we already have returns that contact.
 * With no clientId, the company is guessed from the email domain (G1 map).
 * Shared by POST /api/crm/contacts/quick and by confirming an introduction.
 *
 * Relative imports only, so the tests can load this with a fake database.
 */
import { normalizeAddress } from '../email/classify.js';
import { loadClientDomainMap, guessClientIdForEmail } from './clientDomains.js';

function splitName(name, email) {
  let n = String(name ?? '').trim();
  if (!n && email) {
    // "jane.doe@acme.com" -> "Jane Doe"
    n = email.split('@')[0].split(/[._-]+/).filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  }
  const parts = n.split(/\s+/).filter(Boolean);
  return { name: n || email, firstName: parts[0] || null, lastName: parts.length > 1 ? parts.slice(1).join(' ') : null };
}

/**
 * @returns { contact: { id, name, email, clientId }, created: boolean, clientGuessed: boolean }
 */
export async function quickContact(prisma, { email, name = null, clientId = null, ownerId = null, createdById = null } = {}) {
  const key = normalizeAddress(email);
  if (!key || !key.includes('@')) throw new Error('An email address is needed.');

  const all = await prisma.contact.findMany({ where: { email: { not: null } }, select: { id: true, name: true, email: true, clientId: true } });
  const existing = all.find(c => normalizeAddress(c.email) === key);
  if (existing) {
    // Fill a missing company only; never move someone.
    if (clientId && !existing.clientId) {
      await prisma.contact.update({ where: { id: existing.id }, data: { clientId } });
      existing.clientId = clientId;
    }
    return { contact: existing, created: false, clientGuessed: false };
  }

  let clientGuessed = false;
  if (!clientId) {
    clientId = guessClientIdForEmail(key, await loadClientDomainMap(prisma));
    clientGuessed = Boolean(clientId);
  }

  const client = clientId && prisma.client
    ? await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } })
    : null;
  const agg = await prisma.contact.aggregate({ _max: { contactNumber: true } });
  const { name: full, firstName, lastName } = splitName(name, key);
  const contact = await prisma.contact.create({
    data: {
      contactNumber: (agg._max.contactNumber ?? 0) + 1,
      name: full, firstName, lastName,
      email: key,
      clientId: clientId || null,
      company: client?.name ?? null,
      ownerId: ownerId || null,
      createdById: createdById || ownerId || null,
    },
    select: { id: true, name: true, email: true, clientId: true },
  });
  return { contact, created: true, clientGuessed };
}
