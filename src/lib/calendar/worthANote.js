/**
 * Which calendar events become sales notes, and which are thrown away.
 *
 * This is the one gate. The dry run over Mike's .ics export and the live
 * Microsoft sync both call it, so what the dry run reports is what the import
 * will actually do — the two cannot drift apart.
 *
 * Everything here is a ruling Mike gave on 2026-09-07, after the first dry run
 * over his own calendar showed the original rules throwing away 622 real
 * meetings:
 *
 *  - "Catalina golf mixer is every other week and is a business event. each of
 *     those should count always. even though they are repeating."
 *       → a business title wins over every skip rule below it. Repeating does
 *         not disqualify anything. This is rule 3 and it comes before the rest.
 *
 *  - "so should a work business trip. we should look at how many days people are
 *     traveling to see clients."
 *       → TRAVEL is a business type, so an all-day "Austin trip" survives.
 *
 *  - "all personal events like soccer practice, tennis match, doctors appts,
 *     therapy should be excluded."
 *       → the stop-list runs second, ahead of everything except cancelled, and
 *         its answer is final. Nothing personal reaches a shared CRM.
 *
 *  - Repeating meetings are the noise problem, so a repeating meeting where
 *     everyone on the invite is ILC is skipped. Repeating with somebody outside
 *     the company on it is kept — that is a real client rhythm.
 *
 * Pure: no database, no network, no Microsoft.
 */
import { classifyByTitleAndLocation, isBusinessType, normalizeActivityType } from './inPerson.js';
import { excludeFromNotes } from './personal.js';

export const OUR_DOMAIN = 'ilcstudios.com';

const domainOf = email => String(email || '').split('@')[1]?.toLowerCase() || '';

/**
 * Should this event become a sales note?
 *
 * @param event {
 *   title, location, onlineMeetingUrl, attendeeEmails[], attendeeCount,
 *   isCancelled?, isAllDay?, isRecurring?
 * }
 * @param opts  { internalDomain?, verdict? }   verdict = a classification already
 *                                              worked out, to avoid doing it twice
 * @returns {
 *   keep:    boolean
 *   bucket:  'business title' | 'candidate' | 'personal' | 'not a meeting'
 *          | 'auto booking' | 'cancelled' | 'internal only'
 *          | 'no one else invited' | 'all-day block'
 *   reason:  string          — plain English, safe to show or log
 *   verdict: object|null     — the title/location read, if one was made
 * }
 */
export function isWorthANote(event = {}, opts = {}) {
  const internalDomain = (opts.internalDomain || OUR_DOMAIN).toLowerCase();
  const emails  = (event.attendeeEmails || []).filter(Boolean);
  const people  = event.attendeeCount ?? emails.length;

  // 1. A cancelled meeting did not happen.
  if (event.isCancelled) {
    return { keep: false, bucket: 'cancelled', reason: 'the meeting was cancelled', verdict: null };
  }

  // 2. His life is not the company's business. Final answer, checked before we
  //    classify anything, so a personal appointment is never even read.
  const excluded = excludeFromNotes(event);
  if (excluded.excluded) {
    const bucket = excluded.kind === 'personal' ? 'personal'
      : excluded.kind === 'auto-booking' ? 'auto booking'
      : 'not a meeting';
    return { keep: false, bucket, reason: excluded.reason, verdict: null };
  }

  const verdict = opts.verdict ?? classifyByTitleAndLocation(event);

  // 3. Mike's rule: a business title always counts. Golf, a meal, coffee, happy
  //    hour, a site visit, an event, a travel day — kept whether it repeats every
  //    other week, whether anyone was invited, and whether it is an all-day
  //    block. This is what saves the Catalina Golf Mixer.
  if (verdict && isBusinessType(verdict.activityType)) {
    return {
      keep: true, bucket: 'business title', verdict,
      reason: verdict.reason || 'the title names a business activity',
    };
  }

  // 4. Everyone on it works here. An internal meeting is not a client touch.
  if (people >= 2 && emails.length > 0 && emails.every(e => domainOf(e) === internalDomain)) {
    return { keep: false, bucket: 'internal only', verdict,
             reason: 'everyone on the invite works at ILC' };
  }

  // 5. Nobody else on it, and the title did not say it was business. Mike books
  //    real meetings with nobody on the invite — that is exactly why rule 3 runs
  //    first — but with no name and no business word there is nothing to record.
  if (people <= 1) {
    return { keep: false, bucket: 'no one else invited', verdict,
             reason: 'nobody else was on the invite and the title does not say what it was' };
  }

  // 6. An all-day block with no business word in it is a marker, not a meeting.
  if (event.isAllDay) {
    return { keep: false, bucket: 'all-day block', verdict,
             reason: 'an all-day block with nothing in the title to say it was business' };
  }

  // 7. Somebody outside ILC was on it. That is worth a note — repeating or not.
  return {
    keep: true, bucket: 'candidate', verdict,
    reason: verdict?.reason || 'somebody outside ILC was on the invite',
  };
}

/**
 * One meeting per time period.
 *
 * Mike, 2026-09-07: "anything auto populated like a reservation probably has a
 * meeting right over it. 1 meeting per time period."
 *
 * Two things put the same afternoon on his calendar twice. An app writes a
 * booking confirmation over a dinner he already has booked as a meeting. And a
 * repeating series gets re-listed under a new name each season without the old
 * listing being deleted — "The Catalina Golf Mixer", "Catalina Golf Mixer Season
 * 2" and "Season 3" all sit on the same Thursday, so one real afternoon of golf
 * was being counted three times.
 *
 * Two deliberate exclusions, both of which would wreck the count if included:
 *   - All-day blocks. An all-day event overlaps every meeting that day, so
 *     leaving them in would let one all-day marker swallow a full calendar.
 *   - Travel. Trips are counted in days by travelDates, which does its own
 *     overlap handling; a week in Austin must not eat that week's meetings.
 *
 * Overlapping alone is NOT enough, and the first version of this got that wrong:
 * the golf mixer is a four-hour block, so an overlap-only rule swallowed a real
 * coffee and a real lunch that happened to fall inside it. Two entries only
 * collapse when they look like the SAME meeting written twice:
 *
 *   - they overlap in time, AND
 *   - they start within half an hour of each other, AND
 *   - they are the same kind of thing, or one of them has no kind at all —
 *     which is what a booking confirmation or a bare restaurant name looks like.
 *
 * So three listings of the same 3:10pm tee time collapse to one, and a
 * confirmation sitting on top of a dinner collapses into the dinner, but a
 * coffee that genuinely happened during a long event stays its own meeting.
 *
 * Events that merely touch (one ends exactly as the next begins) are two
 * meetings, not one — the overlap has to be real.
 *
 * Hand it only the events you actually want compared. The dry run hands it the
 * in-person ones and nothing else, because the in-person count is the number
 * Mike checks by hand — a call that happens to sit over a lunch is a separate
 * record and should stay one.
 *
 * @param events [{ start: Date, end: Date, isAllDay?, activityType?, title? }]
 *               Objects are returned as given, so callers can hang whatever they
 *               like off them and map the answer back.
 * @returns { kept: [...], dropped: [{ event, keptInstead, reason }] }
 */
export function dedupeOverlappingMeetings(events = []) {
  const eligible = [];
  const kept = [];

  for (const e of events) {
    const start = e?.start;
    const end   = e?.end;
    const skip  = e?.isAllDay
      || normalizeActivityType(e?.activityType) === 'TRAVEL'
      || !(start instanceof Date) || isNaN(start)
      || !(end instanceof Date)   || isNaN(end);
    if (skip) kept.push(e);
    else eligible.push(e);
  }

  eligible.sort((a, b) => a.start - b.start || b.end - a.end);

  const dropped = [];
  let current = null;   // the entry currently representing this meeting

  for (const e of eligible) {
    if (current && isSameMeeting(current, e)) {
      const winner = betterRecord(current, e);
      const loser  = winner === current ? e : current;
      dropped.push({
        event: loser,
        keptInstead: winner,
        reason: `the same meeting as "${String(winner.title || '').slice(0, 60)}" — same time period, counted once`,
      });
      current = winner;
      continue;
    }
    if (current) kept.push(current);
    current = e;
  }
  if (current) kept.push(current);

  return { kept, dropped };
}

/** How far apart two entries can start and still be the same meeting. */
const SAME_MEETING_MINUTES = 30;

/** Are these two entries the same meeting written down twice? */
function isSameMeeting(a, b) {
  // A real overlap, not a handover.
  if (!(b.start < a.end && a.start < b.end)) return false;
  if (Math.abs(b.start - a.start) > SAME_MEETING_MINUTES * 60_000) return false;

  const ta = normalizeActivityType(a.activityType);
  const tb = normalizeActivityType(b.activityType);
  // An entry with no kind — a bare restaurant name, an app's confirmation — is
  // whatever it is sitting on top of.
  if (!ta || !tb || ta === 'OTHER' || tb === 'OTHER') return true;
  return ta === tb;
}

/** Of two entries over the same slot, which is the one worth keeping? */
function betterRecord(a, b) {
  const score = e => {
    const type = normalizeActivityType(e?.activityType);
    // A named activity beats a bare "there was an address in the location box".
    let n = type && type !== 'OTHER' ? 2 : 0;
    // A longer entry is more likely the meeting; the short one is the booking.
    const ms = (e?.end instanceof Date && e?.start instanceof Date) ? e.end - e.start : 0;
    return { n, ms };
  };
  const sa = score(a);
  const sb = score(b);
  if (sa.n !== sb.n) return sa.n > sb.n ? a : b;
  if (sa.ms !== sb.ms) return sa.ms > sb.ms ? a : b;
  return a;   // same on every count — the earlier one wins, and it sorted first
}

/**
 * How many days did this trip cover?
 *
 * Mike wants travel counted in days, not meetings: "we should look at how many
 * days people are traveling to see clients." An all-day event's end date is
 * exclusive in calendar files (a one-day block ends the next morning), which is
 * why the all-day case subtracts a day before counting.
 */
export function travelDays(start, end, { isAllDay = false } = {}) {
  if (!(start instanceof Date) || isNaN(start)) return 0;
  if (!(end instanceof Date) || isNaN(end)) return 1;

  const ms   = end.getTime() - start.getTime();
  if (ms <= 0) return 1;
  const days = ms / 86_400_000;
  return Math.max(1, isAllDay ? Math.round(days) : Math.ceil(days));
}

/**
 * The distinct calendar dates a set of travel events covers, so two trips that
 * overlap are not counted twice.
 *
 * @param trips [{ start: Date, end: Date, isAllDay?: boolean }]
 * @returns Set of 'YYYY-MM-DD'
 */
export function travelDates(trips = []) {
  const dates = new Set();
  for (const trip of trips) {
    const start = trip.start;
    if (!(start instanceof Date) || isNaN(start)) continue;
    const days = travelDays(start, trip.end, { isAllDay: trip.isAllDay });
    for (let i = 0; i < days; i += 1) {
      const d = new Date(start.getTime() + i * 86_400_000);
      dates.add(d.toISOString().slice(0, 10));
    }
  }
  return dates;
}
