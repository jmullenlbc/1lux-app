/**
 * First publish of a sales note: read the next steps out of the words and
 * switch them on (Mike 9-25: "there needs to be automatic next steps").
 *
 * Steps the AI finds are saved CONFIRMED, not SUGGESTED, so publishing is the
 * one click that starts everything: the recap email is drafted, and anything
 * that is theirs to do (reply, drawings, invite, intro) starts being watched.
 * Nothing is sent — every email waits in the Bot Queue for a person. A step
 * that is wrong is dismissed on the Notes tab, and its draft goes with it on
 * the next publish.
 *
 * Only runs when the note has no steps yet; steps someone added or dismissed
 * by hand while it was a draft are theirs and are left exactly as they are.
 */
import { prisma } from '@/lib/db';
import { readNote } from '@/lib/bot/extractNoteActions';
import { savePersonalFacts } from '@/lib/contacts/savePersonalFacts';
import { getActiveActionTypes } from '@/lib/noteActionTypesStore';

export async function extractActionsOnPublish(noteId) {
  const existing = await prisma.noteAction.count({ where: { noteId } });
  if (existing > 0) return { created: 0 };

  const full = await prisma.note.findUnique({
    where: { id: noteId },
    include: {
      contacts: { include: { contact: { select: { id: true, name: true } } } },
      clients:  { include: { client: { include: { contacts: { select: { id: true, name: true } } } } } },
      owners:   { select: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!full) return { created: 0 };

  const cand = new Map();
  for (const c of full.contacts) if (c.contact) cand.set(c.contact.id, c.contact);
  for (const cl of full.clients) for (const c of (cl.client?.contacts || [])) cand.set(c.id, c);

  const actionTypes = await getActiveActionTypes();
  const { actions: extracted, personal } = await readNote(full, [...cand.values()], actionTypes, { owners: full.owners.map(o => o.user).filter(Boolean) });

  // One person on the note: every step with nobody named is about them.
  const onNote = full.contacts.map(c => c.contact).filter(Boolean);
  const only = onNote.length === 1 ? onNote[0] : null;

  // Kids, golf, cold brew: kept on the person, never turned into a step.
  const facts = await savePersonalFacts(personal, { noteId, createdById: full.createdById || null, onlyContact: only })
    .catch(e => { console.error('[publishActions] personal facts:', e?.message ?? e); return { created: 0 }; });
  if (!extracted.length) return { created: 0, personal: facts.created };
  const now = new Date();

  await prisma.noteAction.createMany({
    data: extracted.map(a => {
      const row = { ...a, noteId };
      if (!row.contactId && only && !row.contactName) { row.contactId = only.id; row.contactName = only.name; }
      if ((row.kind || 'ACTION') === 'ACTION') { row.status = 'CONFIRMED'; row.confirmedAt = now; }
      return row;
    }),
  });
  return { created: extracted.length, personal: facts.created };
}
