/**
 * playbook.js — bot-callable resolvers over the normalized Playbook data.
 *
 * These are the "the bot knows who to email" primitives for the queryable +
 * actionable vision (see memory: project-queryable-actionable). Pure queries —
 * a future budget-email / notify flow (or the Ask-AI bot) calls these to resolve
 * recipients before drafting.
 */
import { prisma } from '@/lib/db';

/**
 * Who should be CC'd / included for a deliverable on a client.
 * @param {string} clientId
 * @param {string} event  BUDGETS | DESIGN_MILESTONE | SUBMITTALS | RFIS | ...
 * @returns [{ contactId, name, email, freetext }]
 */
export async function getDistributionRecipients(clientId, event) {
  const rows = await prisma.playbookDistribution.findMany({ where: { clientId, event } });
  const ids = [...new Set(rows.map(r => r.contactId).filter(Boolean))];
  const contacts = ids.length
    ? await prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
    : [];
  const byId = new Map(contacts.map(c => [c.id, c]));
  return rows
    .map(r => {
      const c = r.contactId ? byId.get(r.contactId) : null;
      return { contactId: r.contactId || null, name: c?.name || r.freetextName || null, email: c?.email || null, freetext: !c };
    })
    .filter(x => x.name || x.email);
}

/** Just the resolvable email addresses for a deliverable. */
export async function getDistributionEmails(clientId, event) {
  return (await getDistributionRecipients(clientId, event)).map(r => r.email).filter(Boolean);
}

/** Resolve a single role assignment (e.g. PROPOSAL_SIGNER_PROJECT) to a contact. */
export async function getAssignedContact(clientId, role) {
  const a = await prisma.playbookAssignment.findUnique({ where: { clientId_role: { clientId, role } } }).catch(() => null);
  if (!a?.contactId) return null;
  return prisma.contact.findUnique({ where: { id: a.contactId }, select: { id: true, name: true, email: true } });
}
