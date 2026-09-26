/**
 * Save the personal facts read out of a note onto the people they are about.
 * Server only. A fact whose person can't be told apart is skipped, never
 * guessed onto the wrong contact. The same fact twice is kept once.
 */
import { prisma } from '@/lib/db';
import { newFacts, personalLine, personalSection } from '@/lib/contacts/personalFacts';

/**
 * @param {Array} personal  [{ category, fact, contactId, contactName }] from readNote
 * @param {object} opts  { noteId, createdById, onlyContact: {id,name}|null }
 */
export async function savePersonalFacts(personal, { noteId = null, createdById = null, onlyContact = null } = {}) {
  if (!personal?.length) return { created: 0 };
  const byContact = new Map();
  for (const p of personal) {
    const id = p.contactId || (!p.contactName && onlyContact ? onlyContact.id : null)
      || (onlyContact && p.contactName && onlyContact.name?.toLowerCase().startsWith(p.contactName.toLowerCase().split(' ')[0]) ? onlyContact.id : null);
    if (!id) continue;
    if (!byContact.has(id)) byContact.set(id, []);
    byContact.get(id).push(p);
  }
  let created = 0;
  for (const [contactId, list] of byContact) {
    const existing = await prisma.contactPersonalFact.findMany({
      where: { contactId, archivedAt: null }, select: { fact: true },
    });
    const fresh = newFacts(list, existing);
    for (const f of fresh) {
      await prisma.contactPersonalFact.create({
        data: { contactId, category: f.category, fact: f.fact, source: 'ai', sourceNoteId: noteId, createdById },
      });
      created++;
    }
  }
  return { created };
}

/** The prompt lines for an email writer, for one contact. Never throws. */
export async function personalPromptFor(contactId, name) {
  if (!contactId) return '';
  try {
    const facts = await prisma.contactPersonalFact.findMany({
      where: { contactId, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 3, select: { fact: true },
    });
    return personalSection(personalLine(facts), name);
  } catch (e) {
    console.error('[personalPromptFor]', e?.message ?? e);
    return '';
  }
}
