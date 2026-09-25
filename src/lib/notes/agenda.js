/**
 * How the Sales Notes list is laid out (Mike 9-25: it "just looks like an email
 * inbox"). Pure, no imports — the screen and the tests share it.
 *
 *   Coming up   — a meeting still ahead, not published. Soonest first.
 *   Needs notes — a draft whose meeting has passed, or with no date. Newest first.
 *   Done        — published. Newest first.
 */
const t = d => (d ? new Date(d).getTime() : null);

export function agendaGroup(note, now = new Date()) {
  if (note.isPublished) return 'done';
  const at = t(note.meetingDate);
  return at !== null && at >= now.getTime() ? 'upcoming' : 'needsNotes';
}

export function groupNotesForAgenda(notes = [], now = new Date()) {
  const out = { upcoming: [], needsNotes: [], done: [] };
  for (const n of notes) out[agendaGroup(n, now)].push(n);
  const when = n => t(n.meetingDate) ?? t(n.updatedAt) ?? t(n.createdAt) ?? 0;
  out.upcoming.sort((a, b) => when(a) - when(b));
  out.needsNotes.sort((a, b) => when(b) - when(a));
  out.done.sort((a, b) => when(b) - when(a));
  return out;
}

/** Which tab a note opens on: Prep before the meeting, Notes after it. */
export function defaultNoteTab(note, { canPrep = false, now = new Date() } = {}) {
  return canPrep && agendaGroup(note, now) === 'upcoming' ? 'prep' : 'notes';
}
