/**
 * Which sales meetings the before-the-meeting sweep preps. Pure — safe in tests.
 *
 * A draft sales note with a meeting in the next two days and no brief built in
 * the last day. Notes with nothing linked are skipped by the builder itself
 * ("link a company, project or person first"), not here.
 */
export const PREP_AHEAD_HOURS    = 48;
export const PREP_FRESH_HOURS    = 24;
export const PREP_PER_RUN        = 2;
export const PREP_TIME_BUDGET_MS = 15_000;

export function prepDueWhere(now = new Date()) {
  const h = n => new Date(now.getTime() + n * 3_600_000);
  return {
    noteType:    'SALES',
    isPublished: false,
    meetingDate: { gte: now, lte: h(PREP_AHEAD_HOURS) },
    meetingBriefs: { none: { createdAt: { gte: h(-PREP_FRESH_HOURS) } } },
    OR: [{ clients: { some: {} } }, { projects: { some: {} } }, { contacts: { some: {} } }],
  };
}

/** Should the Prep tab build a brief by itself when it opens? */
export function shouldAutoPrep(note, hasBrief, now = new Date()) {
  if (hasBrief || !note || note.isPublished || !note.meetingDate) return false;
  const links = (note.clients?.length || 0) + (note.projects?.length || 0) + (note.contacts?.length || 0);
  return links > 0 && new Date(note.meetingDate) >= now;
}
