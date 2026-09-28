/**
 * Shared sales notes (0108, Mike 9-27). Every salesperson on the meeting owns
 * the note and sees it on My Desk. A next step can have a lead, one of the
 * owners; with a lead only the lead gets the step and its reminders, with no
 * lead every owner does ("Both if no one chosen as lead for that task").
 *
 * No imports: safe in the browser and in tests. The database helpers take
 * `prisma` as an argument.
 */

const uniq = xs => [...new Set(xs.filter(Boolean))];

/** Prisma `where` for notes this person owns. */
export const ownedBy = userId => ({ owners: { some: { userId } } });

/** Prisma select for a note's owners. */
export const OWNER_SELECT = { select: { userId: true, user: { select: { id: true, name: true } } } };

/** The note's owner ids, the creator first. Falls back to the creator alone. */
export function ownerIdsOf(note) {
  const ids = uniq((note?.owners || []).map(o => o.userId || o.user?.id || o.id));
  if (!ids.length) return uniq([note?.createdById]);
  const c = note?.createdById;
  return c && ids.includes(c) ? [c, ...ids.filter(x => x !== c)] : ids;
}

/** Who gets this step: its lead, else every owner. A lead no longer on the note falls back to every owner. */
export function stepRecipients(action, ownerIds) {
  const lead = action?.leadUserId;
  if (lead && (!ownerIds?.length || ownerIds.includes(lead))) return [lead];
  return uniq(ownerIds || []);
}

/** Is this step on this person's desk? */
export const stepIsMine = (action, ownerIds, userId) => stepRecipients(action, ownerIds).includes(userId);

const first = name => String(name || '').trim().split(/\s+/)[0] || '';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * "Mike to call Jane", "Mike: send specs", "Mike will…", "Sam's on it" → that
 * owner leads the step. Only when the note has two or more owners, and only
 * when exactly one owner's name starts the line.
 * @param owners [{ id, name }]
 */
export function leadFromText(rawText, owners = []) {
  if (!Array.isArray(owners) || owners.length < 2) return null;
  const text = String(rawText || '').trim();
  const hits = owners.filter(o => {
    const names = uniq([String(o?.name || '').trim(), first(o?.name)]).map(esc);
    if (!names.length) return false;
    return new RegExp(`^(?:${names.join('|')})(?:\\s*[:\\-]|\\s+(?:to|will|should|needs to|is going to|can|'ll)\\b|'ll\\b|'s on\\b)`, 'i').test(text);
  });
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * Who sends a shared note's email to one person. Every step to them led by
 * the same owner: that owner. One owner on the note: them. Otherwise somebody
 * must pick before it can go (Mike 9-27).
 * @returns { userId, pending }
 */
export function senderFor(actions, ownerIds, createdById) {
  const owners = uniq(ownerIds || []);
  const leads = uniq((actions || []).map(a => a?.leadUserId));
  const allLed = (actions || []).length > 0 && (actions || []).every(a => a?.leadUserId);
  if (allLed && leads.length === 1) return { userId: leads[0], pending: false };
  if (owners.length <= 1) return { userId: owners[0] || createdById || null, pending: false };
  return { userId: createdById && owners.includes(createdById) ? createdById : owners[0], pending: true };
}

/** Add owners to a note; ones already on it are left alone. Returns the ids actually added. */
export async function addNoteOwners(prisma, noteId, userIds, { source = 'manual', addedById = null } = {}) {
  const want = uniq(userIds);
  if (!noteId || !want.length) return [];
  const have = new Set((await prisma.noteOwner.findMany({ where: { noteId, userId: { in: want } }, select: { userId: true } })).map(o => o.userId));
  const added = [];
  for (const userId of want.filter(u => !have.has(u))) {
    try { await prisma.noteOwner.create({ data: { noteId, userId, source, addedById } }); added.push(userId); }
    catch (e) { if (e?.code !== 'P2002') throw e; } // added by someone else a moment ago
  }
  return added;
}

/** Is this person an owner of the note (or its creator, for a note from before 0108)? */
export async function isNoteOwner(prisma, noteId, userId) {
  if (!noteId || !userId) return false;
  const n = await prisma.note.findUnique({ where: { id: noteId }, select: { createdById: true, owners: { select: { userId: true } } } });
  return Boolean(n) && ownerIdsOf(n).includes(userId);
}

/** Typed fields save as you type, so one person's run of edits is one history line. */
export const TYPED_FIELDS = new Set(['title', 'body', 'meetingLink']);
export const TYPING_RUN_MS = 10 * 60_000;

/**
 * Note history rows (0108). `changes`: [{ field, before, after }]. Long text is
 * kept whole; the screen shortens it. A typed field edited again by the same
 * person within ten minutes updates that line's "after" instead of adding one.
 * Never throws: history must not block a save.
 */
export async function logNoteChanges(prisma, noteId, user, changes, now = new Date()) {
  const rows = (changes || []).filter(c => c && c.field && String(c.before ?? '') !== String(c.after ?? ''));
  if (!noteId || !rows.length) return 0;
  const str = v => (v == null || v === '' ? null : String(v));
  const who = { userId: user?.id || null, userName: user?.name || user?.email || null };
  try {
    for (const c of rows) {
      if (TYPED_FIELDS.has(c.field) && who.userId) {
        const last = await prisma.noteChange.findFirst({ where: { noteId }, orderBy: { createdAt: 'desc' } });
        if (last && last.field === c.field && last.userId === who.userId && now - new Date(last.createdAt) < TYPING_RUN_MS) {
          await prisma.noteChange.update({ where: { id: last.id }, data: { after: str(c.after) } });
          continue;
        }
      }
      await prisma.noteChange.create({ data: { noteId, ...who, field: c.field, before: str(c.before), after: str(c.after) } });
    }
    return rows.length;
  } catch (e) {
    console.error('[logNoteChanges]', noteId, e?.message ?? e);
    return 0;
  }
}
