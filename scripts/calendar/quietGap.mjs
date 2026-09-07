/**
 * How long is too long? — finding the "went quiet" number from Mike's own calendar.
 *
 * Mike, 2026-09-07, when I asked what number to use: "went quiet after what is
 * the real question." So this does not pick a number. It reads four years of his
 * real meetings and asks the only question that can settle it:
 *
 *   When a gap opens up between two meetings with the same company, how long a
 *   gap does the relationship usually survive — and past what point does it
 *   stop coming back?
 *
 * The method, in plain terms:
 *   1. Keep only meetings that survive the same gate the import uses.
 *   2. Group them by the OUTSIDE company on the invite, by email domain. ILC's
 *      own domain is dropped, and so are the free-mail domains, because
 *      "gmail.com" is not a company and lumping fifty strangers together would
 *      invent a relationship that does not exist.
 *   3. For each company, sort the meeting dates and measure every gap between
 *      one meeting and the next. Every gap measured this way is a gap the
 *      relationship SURVIVED — by definition, another meeting followed it.
 *   4. The answer is the shape of that pile. If 80% of survived gaps are under
 *      N days, then a live relationship that has been silent longer than N is
 *      behaving unlike almost every relationship that came back.
 *
 * The trailing silence — the time since the last meeting, with no next meeting
 * after it — is deliberately NOT mixed into that pile. Those gaps have not
 * finished yet, and counting an unfinished gap as though it were survived would
 * drag the number up. They are reported separately, because they are the actual
 * list of companies that are quiet right now.
 *
 * Writes nothing. Reads the .ics and prints.
 *
 * Usage:
 *   node scripts/calendar/quietGap.mjs "<path to .ics>"
 */
import fs from 'node:fs';
import { isWorthANote } from '../../src/lib/calendar/worthANote.js';

const ICS_PATH   = process.argv[2];
const START_YEAR = 2023;
const OUR_DOMAIN = 'ilcstudios.com';
const DAY        = 86_400_000;

if (!ICS_PATH || !fs.existsSync(ICS_PATH)) {
  console.error('Usage: node scripts/calendar/quietGap.mjs "<path to .ics>"');
  process.exit(1);
}

/**
 * Personal mail providers. A shared domain here says nothing about who anybody
 * works for, so treating one as a company would fuse unrelated people into one
 * fictional relationship with hundreds of meetings.
 */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'comcast.net', 'protonmail.com', 'proton.me', 'ymail.com', 'att.net',
]);

// ── .ics reading (same shapes as icsDryRun.mjs) ──────────────────────────────

const unfold = t => t.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');

const unescapeText = v => String(v || '')
  .replace(/\\n/gi, '\n').replace(/\\,/g, ',')
  .replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();

function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const parts  = line.slice(0, colon).split(';');
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value: line.slice(colon + 1) };
}

const mailtoAddress = v => String(v || '').replace(/^mailto:/i, '').trim().toLowerCase();

function parseStamp(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(String(value || '').trim());
  if (!m) return null;
  const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m;
  return { year: Number(y), date: new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss)) };
}

function readEvents(text) {
  const lines = unfold(text).split(/\r?\n/);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = { attendees: [] }; continue; }
    if (line === 'END:VEVENT')   { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;
    switch (name) {
      case 'SUMMARY':     current.title    = unescapeText(value); break;
      case 'LOCATION':    current.location = unescapeText(value); break;
      case 'STATUS':      current.status   = value.trim().toUpperCase(); break;
      case 'RRULE':       current.rrule    = value.trim(); break;
      case 'RECURRENCE-ID': current.recurrenceId = value.trim(); break;
      case 'ORGANIZER':   current.organizerEmail = mailtoAddress(value); break;
      case 'ATTENDEE': {
        const email = mailtoAddress(value);
        if (email) current.attendees.push({ email });
        break;
      }
      case 'DTSTART':
        current.start = parseStamp(value);
        current.isAllDay = params.VALUE === 'DATE';
        break;
      case 'DTEND': current.end = parseStamp(value); break;
      case 'X-MICROSOFT-CDO-ALLDAYEVENT':
        if (/true/i.test(value)) current.isAllDay = true;
        break;
      case 'X-MICROSOFT-SKYPETEAMSMEETINGURL':
      case 'X-MICROSOFT-ONLINEMEETINGCONFLINK':
        if (value.trim()) current.onlineMeetingUrl = value.trim();
        break;
      default: break;
    }
  }
  return events;
}

function toNeutralEvent(raw) {
  const emails = new Set(raw.attendees.map(a => a.email).filter(Boolean));
  if (raw.organizerEmail) emails.add(raw.organizerEmail);
  return {
    title:            raw.title || '',
    location:         raw.location || '',
    onlineMeetingUrl: raw.onlineMeetingUrl || null,
    attendeeCount:    emails.size,
    attendeeEmails:   [...emails],
    year:             raw.start?.year ?? null,
    isCancelled:      raw.status === 'CANCELLED',
    isAllDay:         !!raw.isAllDay,
    isRecurring:      !!(raw.rrule || raw.recurrenceId),
    startAt:          raw.start?.date ?? null,
  };
}

// ── The measurement ──────────────────────────────────────────────────────────

const domainOf = email => String(email || '').split('@')[1]?.toLowerCase() || '';
const dayKey   = d => d.toISOString().slice(0, 10);

/** The value below which `pct` of the numbers sit. */
function percentile(sorted, pct) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[i];
}

function main() {
  // "Today" is the day the export was taken, not today's real date and NOT the
  // last date in the file. Both of those are wrong in ways that matter: the real
  // date would count the months since the export as silence, and the last date
  // in the file is 2032, because a repeating series is written out with future
  // instances. Using either would report every single company as quiet.
  const asOf = new Date(fs.statSync(ICS_PATH).mtime);

  const all = readEvents(fs.readFileSync(ICS_PATH, 'utf8'))
    .map(toNeutralEvent)
    .filter(e => e.startAt && e.year >= START_YEAR);

  // A meeting that has not happened yet cannot end a silence.
  const events = all.filter(e => e.startAt <= asOf);
  const future = all.length - events.length;

  console.log(`Read ${all.length.toLocaleString()} events from ${START_YEAR} on `
    + `(${future.toLocaleString()} of them scheduled after the export, set aside).`);
  console.log(`Export taken ${dayKey(asOf)} — that is "today" for this.\n`);

  // company domain → Set of day keys it was met on
  const touchesInPerson = new Map();
  const touchesAny      = new Map();

  const record = (map, domain, day) => {
    if (!map.has(domain)) map.set(domain, new Set());
    map.get(domain).add(day);
  };

  let kept = 0;
  for (const event of events) {
    const answer = isWorthANote(event);
    if (!answer.keep) continue;
    kept += 1;

    const outside = new Set(
      event.attendeeEmails
        .map(domainOf)
        .filter(d => d && d !== OUR_DOMAIN && !FREE_MAIL.has(d)),
    );
    if (!outside.size) continue;

    const day = dayKey(event.startAt);
    for (const domain of outside) {
      record(touchesAny, domain, day);
      if (answer.verdict?.isInPerson) record(touchesInPerson, domain, day);
    }
  }

  console.log(`${kept.toLocaleString()} meetings worth a note; `
    + `${touchesAny.size} outside companies on them.\n`);

  report('ANY business meeting (in person, calls, site visits)', touchesAny, asOf);
  report('IN-PERSON meetings only', touchesInPerson, asOf);
}

/**
 * @param map  domain → Set of 'YYYY-MM-DD'
 */
function report(label, map, asOf) {
  console.log(`\n${'='.repeat(74)}\n${label}\n${'='.repeat(74)}`);

  // Only relationships with more than one meeting can produce a gap at all, and
  // a company met exactly once is a first date, not a relationship that lapsed.
  const relationships = [];
  for (const [domain, days] of map) {
    const dates = [...days].sort().map(d => new Date(`${d}T00:00:00Z`));
    if (dates.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < dates.length; i += 1) {
      gaps.push(Math.round((dates[i] - dates[i - 1]) / DAY));
    }
    const yearAgo = asOf - 365 * DAY;
    relationships.push({
      domain,
      meetings: dates.length,
      recentMeetings: dates.filter(d => d >= yearAgo).length,
      gaps,
      last: dates[dates.length - 1],
      silentFor: Math.round((asOf - dates[dates.length - 1]) / DAY),
    });
  }

  const allGaps = relationships.flatMap(r => r.gaps).sort((a, b) => a - b);
  console.log(`\n${relationships.length} companies met more than once, `
    + `${allGaps.length} gaps between meetings.\n`);

  if (!allGaps.length) return;

  console.log('  Gaps the relationship SURVIVED — a meeting followed every one of these:');
  for (const p of [50, 60, 70, 75, 80, 85, 90, 95]) {
    const v = percentile(allGaps, p);
    console.log(`    ${String(p).padStart(2)}% of gaps are ${String(v).padStart(4)} days or less`);
  }

  // The practical read: for each candidate threshold, how much of normal life
  // does it flag? A threshold that flags a quarter of everything is a threshold
  // nobody will read twice.
  console.log('\n  If the line were drawn here, how much NORMAL rhythm gets flagged:');
  for (const t of [30, 45, 60, 75, 90, 120, 150, 180]) {
    const over = allGaps.filter(g => g > t).length;
    const pct  = ((over / allGaps.length) * 100).toFixed(1);
    console.log(`    over ${String(t).padStart(3)} days → ${String(over).padStart(4)} of ${allGaps.length} normal gaps (${pct}%) would have been called quiet`);
  }

  // Who is quiet right now, at each line.
  console.log('\n  How many companies would be on the list today (every company ever met):');
  for (const t of [30, 45, 60, 75, 90, 120, 150, 180]) {
    const now = relationships.filter(r => r.silentFor > t).length;
    console.log(`    over ${String(t).padStart(3)} days → ${String(now).padStart(3)} of ${relationships.length} companies`);
  }

  // The number above is not the real list length. Four years of history is full
  // of relationships that ended for good reasons — the job finished, the person
  // left, the deal died in 2023. A weekly list that reopens all of them is a
  // graveyard, not a to-do list. The honest question is: of the relationships
  // that were alive in the last year, how many have gone quiet?
  const live = relationships.filter(r => r.silentFor <= 365);
  console.log(`\n  Of the ${live.length} companies met within the last year, how many are quiet:`);
  for (const t of [30, 45, 60, 75, 90, 120, 150, 180]) {
    const now = live.filter(r => r.silentFor > t).length;
    console.log(`    over ${String(t).padStart(3)} days → ${String(now).padStart(3)} companies on the list`);
  }

  // Even that is too long to read on a Monday, because a single invite drags in
  // consultants, city staff and vendors who were never a relationship at all.
  // Tightening to companies actually worked with — met several times in the last
  // year — is what turns the number into a list a person will read.
  for (const min of [3, 5]) {
    const core = live.filter(r => r.recentMeetings >= min);
    console.log(`\n  Narrowed to the ${core.length} companies met ${min}+ times in the last year:`);
    for (const t of [30, 45, 60, 75, 90, 120]) {
      const now = core.filter(r => r.silentFor > t).length;
      console.log(`    over ${String(t).padStart(3)} days → ${String(now).padStart(3)} companies on the list`);
    }
  }

  // A relationship's own rhythm, for comparison with one flat number.
  const typical = relationships
    .map(r => [...r.gaps].sort((a, b) => a - b)[Math.floor(r.gaps.length / 2)])
    .sort((a, b) => a - b);
  console.log(`\n  Each company's own usual gap, across all of them:`);
  for (const p of [25, 50, 75, 90]) {
    console.log(`    ${String(p).padStart(2)}% of companies normally go ${String(percentile(typical, p)).padStart(4)} days or less between meetings`);
  }

  // The busiest relationships — the ones a weekly list is really about.
  const busiest = relationships
    .filter(r => r.meetings >= 4)
    .sort((a, b) => b.silentFor - a.silentFor)
    .slice(0, 15);
  if (busiest.length) {
    console.log(`\n  Longest silences among companies met 4+ times (top 15):`);
    for (const r of busiest) {
      console.log(`    ${String(r.silentFor).padStart(4)} days quiet  ·  ${String(r.meetings).padStart(3)} meetings  ·  ${r.domain}`);
    }
  }
}

main();
