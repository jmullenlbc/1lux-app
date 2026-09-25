/**
 * Sales-note links (companies, projects, people) and the "last met" dates.
 *
 * Links are added without `skipDuplicates` (Postgres-only; it throws on the
 * local SQLite) — existing links are looked up and skipped instead.
 */

// Shared by the list page, GET/PATCH and create, so every screen sees people.
export const NOTE_CONTACTS_INCLUDE = {
  include: { contact: { select: { id: true, name: true, title: true, email: true, company: true, client: { select: { id: true, name: true } } } } },
  orderBy: { createdAt: 'asc' },
};

const MODELS = {
  client:  { model: 'noteClient',  key: 'clientId'  },
  project: { model: 'noteProject', key: 'projectId' },
  contact: { model: 'noteContact', key: 'contactId' },
};

/** Link ids to a note, skipping ones already linked. */
export async function addNoteLinks(db, kind, noteId, ids) {
  const { model, key } = MODELS[kind];
  const want = [...new Set((ids || []).filter(Boolean))];
  if (!want.length) return;
  const have = new Set((await db[model].findMany({ where: { noteId, [key]: { in: want } }, select: { [key]: true } })).map(r => r[key]));
  const add = want.filter(id => !have.has(id));
  if (add.length) await db[model].createMany({ data: add.map(id => ({ noteId, [key]: id })) });
}

export async function removeNoteLinks(db, kind, noteId, ids) {
  const { model, key } = MODELS[kind];
  if (ids?.length) await db[model].deleteMany({ where: { noteId, [key]: { in: ids } } });
}

/** Make the note's people exactly `ids`. */
export async function setNoteContacts(db, noteId, ids) {
  const want = new Set((ids || []).filter(Boolean));
  const have = (await db.noteContact.findMany({ where: { noteId }, select: { contactId: true } })).map(r => r.contactId);
  await removeNoteLinks(db, 'contact', noteId, have.filter(id => !want.has(id)));
  await addNoteLinks(db, 'contact', noteId, [...want]);
}

/**
 * A published, in-person note moves its people's "last met in person" and
 * "last touch" dates forward — never back. Only publishing calls this: a draft
 * is not a meeting yet.
 */
export async function stampLastMet(db, noteId, meetingDate) {
  if (!meetingDate) return;
  const when = new Date(meetingDate);
  const links = await db.noteContact.findMany({ where: { noteId }, select: { contactId: true } });
  for (const { contactId } of links) {
    const c = await db.contact.findUnique({ where: { id: contactId }, select: { lastInPersonAt: true, lastTouchpointAt: true } });
    if (!c) continue;
    const data = {};
    if (!c.lastInPersonAt   || c.lastInPersonAt   < when) data.lastInPersonAt   = when;
    if (!c.lastTouchpointAt || c.lastTouchpointAt < when) data.lastTouchpointAt = when;
    if (Object.keys(data).length) await db.contact.update({ where: { id: contactId }, data });
  }
}
