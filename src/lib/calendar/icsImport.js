/**
 * Admin > Calendar Upload: what an .ics export would become, before anything
 * is written.
 *
 * Mike 10-29: "Can I get a most recent Google takeout and upload the calendar
 * to show sales activity". The browser reads the file (ics.js), this file runs
 * the same gate the dry run and the live sync use (worthANote.js), collapses
 * one meeting per time period, and counts what is left. The server runs
 * checkImportEvent on every event it is sent, so nothing personal gets in even
 * if the page is tampered with.
 *
 * Pure: no database, no network. Relative imports so node tests load it.
 */
import { readEvents, toNeutralEvent } from './ics.js';
import { isWorthANote, dedupeOverlappingMeetings, travelDays } from './worthANote.js';
import { classifyByTitleAndLocation, normalizeActivityType } from './inPerson.js';

/** Mike, 2026-09-07: "start with 2023." */
export const DEFAULT_START = '2023-01-01';

/** Events sent to the server per request: well under the upload cap and 30 s. */
export const IMPORT_BATCH = 150;

/** The in-person kinds the preview counts, in the order the page shows them. */
export const PREVIEW_TYPES = [
  { key: 'COFFEE',     label: 'Coffee' },
  { key: 'MEAL',       label: 'Meal' },
  { key: 'GOLF',       label: 'Golf' },
  { key: 'HAPPY_HOUR', label: 'Happy hour' },
  { key: 'SITE_VISIT', label: 'Site visit' },
];

/** What the history line on each imported note says; Undo finds the batch by it. */
export const IMPORT_MARK = 'Calendar upload';
export const importMark = importId => `${IMPORT_MARK} ${importId}`;
/** What Undo writes on the note's archived line, so a later upload can bring it back. */
export const UNDO_MARK = 'Archived (calendar upload undone)';

/** The note key: the same event and start always finds the same note. */
export function importRef(uid, startAt) {
  const start = startAt instanceof Date ? startAt : new Date(startAt);
  return `ics:${uid}:${start.toISOString()}`;
}

// Google writes the mailbox's own answer on its attendee line. The gate reads
// the Outlook words (Maram 9-17: accepted invites only).
const PARTSTAT = { DECLINED: 'declined', 'NEEDS-ACTION': 'notresponded', TENTATIVE: 'tentativelyaccepted' };

/** The mailbox owner's answer to the invite, in the words notAcceptedReason reads. */
export function responseFor(raw, mailbox) {
  const me = String(mailbox || '').trim().toLowerCase();
  if (!me) return undefined;
  const line = (raw.attendees || []).find(a => a.email === me);
  return line ? PARTSTAT[line.partstat] : undefined;
}

const parseDay = s => {
  const d = new Date(`${String(s || DEFAULT_START).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date(`${DEFAULT_START}T00:00:00Z`) : d;
};

/**
 * Read the file and work out what an upload would do.
 *
 * @param text the .ics file as text
 * @param opts { startDate 'YYYY-MM-DD', now Date, mailbox email of whose calendar it is }
 * @returns {
 *   total, beforeStart, buckets { name: n }, personal, skipped { name: n },
 *   collapsed, kept [item], byYear { year: { COFFEE.., inPerson, total, travelDays } },
 *   travelDays, past, future
 * }
 */
export function planImport(text, { startDate = DEFAULT_START, now = new Date(), mailbox = '' } = {}) {
  return planFromRaws(readEvents(text), { startDate, now, mailbox });
}

export function planFromRaws(raws, { startDate = DEFAULT_START, now = new Date(), mailbox = '' } = {}) {
  const from = parseDay(startDate);
  const buckets = {};
  const skipped = {};
  let beforeStart = 0;
  let personal = 0;
  const candidates = [];

  for (const raw of raws) {
    const event = toNeutralEvent(raw);
    event.responseStatus = responseFor(raw, mailbox);
    if (!event.startAt || !event.externalId) { skipped['no date or id'] = (skipped['no date or id'] || 0) + 1; continue; }
    if (event.startAt < from) { beforeStart += 1; continue; }

    const answer = isWorthANote(event);
    buckets[answer.bucket] = (buckets[answer.bucket] || 0) + 1;
    if (!answer.keep) {
      if (answer.bucket === 'personal') personal += 1;
      else skipped[answer.bucket] = (skipped[answer.bucket] || 0) + 1;
      continue;
    }
    candidates.push({ event, verdict: answer.verdict });
  }

  // Mike 9-07: "1 meeting per time period." In-person ones only, as the dry run.
  const inPerson = candidates.filter(c => c.verdict?.isInPerson);
  const { dropped } = dedupeOverlappingMeetings(inPerson.map(c => ({
    start: c.event.startAt, end: c.event.endAt, isAllDay: c.event.isAllDay,
    activityType: c.verdict?.activityType, title: c.event.title, item: c,
  })));
  const gone = new Set(dropped.map(d => d.event.item));

  const kept = [];
  const byYear = {};
  const travelByYear = {};
  const seen = new Set();
  for (const c of candidates) {
    if (gone.has(c)) continue;
    const { event, verdict } = c;
    const ref = importRef(event.externalId, event.startAt);
    if (seen.has(ref)) continue;   // the same event listed twice in one file
    seen.add(ref);
    const type = normalizeActivityType(verdict?.activityType) || 'OTHER';
    const item = {
      ref,
      title:            event.title,
      location:         event.location,
      startAt:          event.startAt.toISOString(),
      endAt:            event.endAt ? event.endAt.toISOString() : null,
      isAllDay:         event.isAllDay,
      isRecurring:      event.isRecurring,
      attendees:        event.attendees,
      organizerEmail:   event.organizerEmail,
      onlineMeetingUrl: event.onlineMeetingUrl,
      year:             event.year,
      activityType:     type,
      isInPerson:       Boolean(verdict?.isInPerson),
      source:           verdict?.source || 'keyword',
      confidence:       verdict?.confidence ?? null,
      reason:           verdict?.reason || '',
      isPast:           event.startAt < now,
    };
    kept.push(item);

    const y = byYear[event.year] || (byYear[event.year] = {
      COFFEE: 0, MEAL: 0, GOLF: 0, HAPPY_HOUR: 0, SITE_VISIT: 0, inPerson: 0, total: 0, travelDays: 0,
    });
    y.total += 1;
    if (item.isInPerson) {
      y.inPerson += 1;
      if (y[type] !== undefined) y[type] += 1;
    }
    if (type === 'TRAVEL') {
      const set = travelByYear[event.year] || (travelByYear[event.year] = new Set());
      const days = travelDays(event.startAt, event.endAt, { isAllDay: event.isAllDay });
      for (let i = 0; i < days; i += 1) {
        set.add(new Date(event.startAt.getTime() + i * 86_400_000).toISOString().slice(0, 10));
      }
    }
  }
  let travel = 0;
  for (const [year, set] of Object.entries(travelByYear)) {
    byYear[year].travelDays = set.size;
    travel += set.size;
  }

  kept.sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
  const past = kept.filter(k => k.isPast).length;
  return {
    total: raws.length, beforeStart, buckets, personal, skipped,
    collapsed: dropped.length, kept, byYear, travelDays: travel,
    past, future: kept.length - past,
  };
}

/**
 * The server's own check on one event the page sent: rebuilt from the fields
 * sent and run through the same gate. Returns the verdict to save, or a plain
 * reason it was refused.
 */
export function checkImportEvent(item = {}) {
  const startAt = new Date(item.startAt);
  if (!item.ref || !String(item.ref).startsWith('ics:') || Number.isNaN(startAt.getTime())) {
    return { ok: false, reason: 'the event had no date or id' };
  }
  const attendees = Array.isArray(item.attendees)
    ? item.attendees.filter(a => a && a.email).map(a => ({ email: String(a.email).toLowerCase(), name: String(a.name || '') }))
    : [];
  const emails = new Set(attendees.map(a => a.email));
  if (item.organizerEmail) emails.add(String(item.organizerEmail).toLowerCase());
  const endAt = item.endAt ? new Date(item.endAt) : null;
  const event = {
    externalId: item.ref, title: String(item.title || ''), location: String(item.location || ''),
    onlineMeetingUrl: item.onlineMeetingUrl || null,
    attendees, attendeeEmails: [...emails], attendeeCount: emails.size,
    organizerEmail: String(item.organizerEmail || '').toLowerCase(),
    isAllDay: !!item.isAllDay, isRecurring: !!item.isRecurring, isCancelled: false,
    startAt, endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
  };
  const answer = isWorthANote(event, { verdict: classifyByTitleAndLocation(event) });
  if (!answer.keep) return { ok: false, reason: answer.reason, event };
  const v = answer.verdict;
  return {
    ok: true, event,
    verdict: {
      activityType: normalizeActivityType(v?.activityType) || 'OTHER',
      isInPerson:   Boolean(v?.isInPerson),
      source:       v?.source || 'keyword',
      confidence:   v?.confidence ?? null,
      reason:       v?.reason || answer.reason,
    },
  };
}

/** Split a list into request-sized pieces. */
export function batches(list, size = IMPORT_BATCH) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** The body a past meeting's note gets: what the calendar said, nothing more. */
export function importedBody(item, verdict) {
  // No "When" line: the note's meeting date already says it, in the reader's zone.
  const lines = ['Imported from the calendar upload.'];
  if (item.location) lines.push(`Where: ${item.location}`);
  const guests = (item.attendees || []).map(a => a.name || a.email).filter(Boolean);
  if (guests.length) lines.push(`Who: ${guests.join(', ')}`);
  if (verdict?.reason) lines.push('', `Read as ${verdict.isInPerson ? 'in person' : 'not in person'} because ${verdict.reason}.`);
  return lines.join('\n');
}
