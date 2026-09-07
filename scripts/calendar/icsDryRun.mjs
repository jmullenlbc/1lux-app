/**
 * Calendar dry run — reads an Outlook .ics export and reports what WOULD happen.
 *
 * Mike, 2026-09-07: "would it be stupid to upload my calendar as a static thing
 * now until we get Microsoft synced?" — and then "yes" to a dry run first.
 *
 * This script WRITES NOTHING to the database. It reads the export, runs the same
 * title/location rules the live sync will use (src/lib/calendar/inPerson.js),
 * and prints what it found. Nothing here is undoable.
 *
 * It also grades itself against Mike's own hand-counted workbook
 * ("In-Person Business Events Summary (2023-2026) V2.xlsx") so we can see how
 * close the keyword rules get to the real answer before writing a single note.
 *
 * Usage:
 *   node scripts/calendar/icsDryRun.mjs "<path to .ics>" ["<path to summary .xlsx>"]
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

import { isWorthANote, travelDays, dedupeOverlappingMeetings } from '../../src/lib/calendar/worthANote.js';

const ICS_PATH     = process.argv[2];
const SUMMARY_PATH = process.argv[3] || null;
const OUT_DIR      = process.argv[4] || null;

/**
 * Mike, 2026-09-07: "start with 2023." His own hand-counted workbook starts
 * there, so anything older has nothing to be graded against and is noise.
 */
const START_YEAR = 2023;

// ── Reading the file ─────────────────────────────────────────────────────────

/**
 * An .ics file wraps long lines: a line starting with a space or tab is a
 * continuation of the one before it. Undo that before anything else, or half the
 * long meeting titles come out chopped.
 */
function unfold(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

/** Calendar files escape commas, semicolons and newlines. Put them back. */
function unescapeText(value) {
  return String(value || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/** Split "NAME;PARAM=x;PARAM=y:value" into its three parts. */
function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head  = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(';');
  const name  = parts[0].toUpperCase();
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

function mailtoAddress(value) {
  return String(value || '').replace(/^mailto:/i, '').trim().toLowerCase();
}

/**
 * A calendar timestamp is 20230104T100000Z, or the same without the Z, or just
 * 20230104 for an all-day event. We only need the year and the length, so this
 * stays deliberately simple rather than pretending to handle every time zone.
 */
function parseStamp(value) {
  const v = String(value || '').trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m;
  return {
    year: Number(y),
    date: new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss)),
  };
}

/** Pull every VEVENT out of the file as a plain object of its properties. */
function readEvents(text) {
  const lines  = unfold(text).split(/\r?\n/);
  const events = [];
  let current  = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = { attendees: [] }; continue; }
    if (line === 'END:VEVENT')   { if (current) events.push(current); current = null; continue; }
    if (!current) continue;

    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    switch (name) {
      case 'UID':           current.uid       = value.trim();            break;
      case 'SUMMARY':       current.title     = unescapeText(value);     break;
      case 'LOCATION':      current.location  = unescapeText(value);     break;
      case 'DESCRIPTION':   current.body      = unescapeText(value);     break;
      case 'STATUS':        current.status    = value.trim().toUpperCase(); break;
      case 'RRULE':         current.rrule     = value.trim();            break;
      case 'RECURRENCE-ID': current.recurrenceId = value.trim();         break;
      case 'ORGANIZER':
        current.organizerEmail = mailtoAddress(value);
        current.organizerName  = params.CN || '';
        break;
      case 'ATTENDEE': {
        const email = mailtoAddress(value);
        if (email) current.attendees.push({ email, name: params.CN || '' });
        break;
      }
      case 'DTSTART':
        current.start   = parseStamp(value);
        current.isAllDay = params.VALUE === 'DATE';
        break;
      case 'DTEND':
        current.end = parseStamp(value);
        break;
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

// ── Turning one into the shape the rules expect ──────────────────────────────

function toNeutralEvent(raw) {
  const emails = new Set(raw.attendees.map(a => a.email).filter(Boolean));
  if (raw.organizerEmail) emails.add(raw.organizerEmail);
  const minutes = raw.start?.date && raw.end?.date
    ? Math.round((raw.end.date - raw.start.date) / 60000)
    : null;
  return {
    externalId:       raw.uid || null,
    title:            raw.title || '',
    location:         raw.location || '',
    body:             raw.body || '',
    onlineMeetingUrl: raw.onlineMeetingUrl || null,
    attendeeCount:    emails.size,
    attendeeEmails:   [...emails],
    organizerEmail:   raw.organizerEmail || '',
    year:             raw.start?.year ?? null,
    durationMinutes:  minutes && minutes > 0 ? minutes : null,
    // The three flags the keep-or-throw-away gate reads. Recurring is carried
    // for the report only — Mike's ruling is that repeating on its own never
    // disqualifies anything: "Catalina golf mixer is every other week and is a
    // business event. each of those should count always."
    isCancelled:      raw.status === 'CANCELLED',
    isAllDay:         !!raw.isAllDay,
    isRecurring:      !!(raw.rrule || raw.recurrenceId),
    startAt:          raw.start?.date ?? null,
    endAt:            raw.end?.date ?? null,
  };
}

// ── The report ───────────────────────────────────────────────────────────────
//
// There is no bucketing logic in this file any more. isWorthANote in
// src/lib/calendar/worthANote.js is the one gate, and the live Microsoft sync
// will call exactly the same function — so what this dry run reports is what the
// import will actually do.

/** Mike's own hand counts, read back out of his workbook so we can be graded. */
function readMikeCounts(file) {
  if (!file || !fs.existsSync(file)) return null;
  const wb   = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
  const out  = {};
  for (const row of rows.slice(1)) {
    const year = Number(String(row[0] || '').slice(0, 4));
    if (!year) continue;
    out[year] = {
      COFFEE:     Number(row[1]) || 0,
      // Mike's column is headed "Lunches"; the app calls it MEAL now.
      MEAL:       Number(row[2]) || 0,
      GOLF:       Number(row[3]) || 0,
      HAPPY_HOUR: Number(row[4]) || 0,
      total:      Number(row[5]) || 0,
      extrapolated: /extrapolat/i.test(String(row[0])),
    };
  }
  return out;
}

function main() {
  if (!ICS_PATH || !fs.existsSync(ICS_PATH)) {
    console.error(`Could not find the calendar file: ${ICS_PATH}`);
    process.exit(1);
  }

  const text   = fs.readFileSync(ICS_PATH, 'utf8');
  const raws   = readEvents(text);
  console.log(`Read ${raws.length.toLocaleString()} events from ${path.basename(ICS_PATH)}`);

  const buckets     = new Map();
  const kept        = [];
  const rows        = [];
  const fallThrough = new Map();
  const byYear      = new Map();   // year → counts per type + in-person + travel days
  const personalRows    = [];      // what the stop-list threw out, so Mike can check it
  const skippedInPerson = [];      // in-person meetings still sitting in a skipped bucket
  const travelByYear    = new Map(); // year → Set of 'YYYY-MM-DD'
  let   before2023 = 0;

  const blankYear = () => ({
    COFFEE: 0, MEAL: 0, GOLF: 0, HAPPY_HOUR: 0, SITE_VISIT: 0, EVENT: 0, TRAVEL: 0,
    inPerson: 0, total: 0,
  });

  for (const raw of raws) {
    const event = toNeutralEvent(raw);

    // Mike: "start with 2023."
    if (event.year && event.year < START_YEAR) { before2023 += 1; continue; }

    const answer  = isWorthANote(event);
    const verdict = answer.verdict;
    buckets.set(answer.bucket, (buckets.get(answer.bucket) || 0) + 1);

    if (answer.bucket === 'personal' || answer.bucket === 'not a meeting') {
      personalRows.push({
        Year: event.year ?? '', Title: event.title,
        Why: answer.reason, Kind: answer.bucket,
      });
    }

    // A meeting we would still throw away that the title says was a real one.
    // After Mike's rulings this list should be close to empty — that is the test.
    if (!answer.keep && answer.bucket !== 'cancelled' && answer.bucket !== 'personal'
        && answer.bucket !== 'not a meeting' && verdict?.isInPerson) {
      skippedInPerson.push({
        Bucket: answer.bucket, Year: event.year ?? '', Title: event.title,
        Location: event.location, People: event.attendeeCount,
        Type: verdict.activityType,
      });
    }

    if (!answer.keep) continue;
    kept.push({ event, verdict, bucket: answer.bucket, answer });
  }

  // ── One meeting per time period ────────────────────────────────────────────
  //
  // Mike, 2026-09-07: "1 meeting per time period." Run this BEFORE anything is
  // counted, or the year totals include the same afternoon twice. Only the
  // in-person ones are compared — that is the number he checks by hand, and a
  // call sitting over a lunch is still a separate record worth keeping.
  const inPersonKept = kept.filter(k => k.verdict?.isInPerson);
  const { dropped: overlapDropped } = dedupeOverlappingMeetings(
    inPersonKept.map(k => ({
      start: k.event.startAt, end: k.event.endAt, isAllDay: k.event.isAllDay,
      activityType: k.verdict?.activityType, title: k.event.title, item: k,
    })),
  );
  const collapsed = new Set(overlapDropped.map(d => d.event.item));
  const overlapRows = overlapDropped.map(d => ({
    Year: d.event.item.event.year ?? '',
    'Dropped (counted once)': d.event.title,
    Type: d.event.activityType,
    'Kept instead': d.keptInstead.title,
    When: d.event.start ? d.event.start.toISOString().slice(0, 16).replace('T', ' ') : '',
  }));

  for (const k of kept) {
    if (collapsed.has(k)) continue;
    const { event, verdict, answer } = k;

    const type = verdict?.activityType || '(no answer)';
    rows.push({
      Year: event.year ?? '',
      Title: event.title,
      Location: event.location,
      People: event.attendeeCount,
      Type: type,
      'In person': verdict?.isInPerson ? 'yes' : 'no',
      Repeating: event.isRecurring ? 'yes' : 'no',
      Kept: answer.bucket,
      Confidence: verdict?.confidence ?? '',
      Why: verdict?.reason ?? answer.reason,
    });

    if (!verdict || verdict.activityType === 'OTHER') {
      const key = event.title.trim() || '(no title)';
      fallThrough.set(key, (fallThrough.get(key) || 0) + 1);
    }

    if (event.year) {
      if (!byYear.has(event.year)) byYear.set(event.year, blankYear());
      const y = byYear.get(event.year);
      y.total += 1;
      if (verdict?.isInPerson) y.inPerson += 1;
      if (verdict && y[verdict.activityType] !== undefined) y[verdict.activityType] += 1;

      // Days on the road, counted in days rather than meetings, and de-duplicated
      // so two trips that overlap are not counted twice.
      if (verdict?.activityType === 'TRAVEL' && event.startAt) {
        if (!travelByYear.has(event.year)) travelByYear.set(event.year, new Set());
        const set  = travelByYear.get(event.year);
        const days = travelDays(event.startAt, event.endAt, { isAllDay: event.isAllDay });
        for (let i = 0; i < days; i += 1) {
          set.add(new Date(event.startAt.getTime() + i * 86_400_000).toISOString().slice(0, 10));
        }
      }
    }
  }

  const finalKept = kept.filter(k => !collapsed.has(k));

  // ── Print it ───────────────────────────────────────────────────────────────

  console.log(`\nStarting at ${START_YEAR} — ${before2023.toLocaleString()} older events set aside.`);

  console.log('\n--- What is in the file ---');
  const order = ['business title', 'candidate', 'personal', 'not a meeting',
    'auto booking', 'internal only', 'no one else invited', 'all-day block', 'cancelled'];
  for (const name of order) {
    if (buckets.has(name)) {
      const mark = (name === 'business title' || name === 'candidate') ? 'KEEP  ' : 'skip  ';
      console.log(`  ${String(buckets.get(name)).padStart(6)}  ${mark}${name}`);
    }
  }

  console.log(`\n--- One meeting per time period: ${overlapDropped.length} entries collapsed into the meeting they overlap ---`);
  for (const r of overlapRows.slice(0, 15)) {
    console.log(`  ${String(r.Year)}  ${String(r['Dropped (counted once)']).slice(0, 42).padEnd(42)} → kept "${String(r['Kept instead']).slice(0, 34)}"`);
  }

  console.log('\n--- How the meetings worth a note classify ---');
  const typeCounts = new Map();
  for (const { verdict } of finalKept) {
    const t = verdict?.activityType || '(no answer)';
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  for (const [type, n] of [...typeCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${type}`);
  }
  const inPersonTotal = finalKept.filter(c => c.verdict?.isInPerson).length;
  console.log(`\n  ${inPersonTotal} of ${finalKept.length} read as in person.`);

  console.log('\n--- In person by year ---');
  const years = [...byYear.keys()].sort();
  console.log('  year   coffee   meals   golf   happy   site   IN PERSON  events  travel days');
  for (const y of years) {
    const c = byYear.get(y);
    const td = travelByYear.get(y)?.size ?? 0;
    console.log(`  ${y}  ${String(c.COFFEE).padStart(6)} ${String(c.MEAL).padStart(7)} ` +
      `${String(c.GOLF).padStart(6)} ${String(c.HAPPY_HOUR).padStart(7)} ${String(c.SITE_VISIT).padStart(6)} ` +
      `${String(c.inPerson).padStart(10)} ${String(c.EVENT).padStart(7)} ${String(td).padStart(12)}`);
  }

  // Graded against Mike's own counts.
  const mike = readMikeCounts(SUMMARY_PATH);
  const gradeRows = [];
  if (mike) {
    console.log("\n--- Against Mike's hand counts (coffee + meals + golf + happy hour) ---");
    console.log('  year    mine   Mike   diff');
    for (const y of years) {
      if (!mike[y]) continue;
      const c = byYear.get(y);
      const mineFour = c.COFFEE + c.MEAL + c.GOLF + c.HAPPY_HOUR;
      const diff = mineFour - mike[y].total;
      const note = mike[y].extrapolated ? '  (Mike extrapolated this year)' : '';
      console.log(`  ${y}  ${String(mineFour).padStart(6)} ${String(mike[y].total).padStart(6)} ${String(diff > 0 ? '+' + diff : diff).padStart(6)}${note}`);
      gradeRows.push({
        Year: y, 'Mine (4 types)': mineFour, "Mike's count": mike[y].total, Difference: diff,
        'Mine coffee': c.COFFEE, "Mike's coffee": mike[y].COFFEE,
        'Mine meals':  c.MEAL,   "Mike's lunches": mike[y].MEAL,
        'Mine golf':   c.GOLF,   "Mike's golf":   mike[y].GOLF,
        'Mine happy hour': c.HAPPY_HOUR, "Mike's happy hour": mike[y].HAPPY_HOUR,
        Note: mike[y].extrapolated ? 'Mike extrapolated this year' : '',
      });
    }
  }

  const fallRows = [...fallThrough].sort((a, b) => b[1] - a[1])
    .map(([title, count]) => ({ Title: title, Times: count }));
  console.log(`\n--- Titles the words did not catch (${fallRows.length} distinct, top 25) ---`);
  for (const r of fallRows.slice(0, 25)) {
    console.log(`  ${String(r.Times).padStart(4)}  ${r.Title.slice(0, 70)}`);
  }

  // The count now runs ABOVE Mike's hand count, and the likeliest reason is his
  // own ruling: "each of those should count always. even though they are
  // repeating." This lists the in-person titles kept more than twice, so he can
  // see at a glance how much of the gap is one event that repeats.
  const repeatTitles = new Map();
  for (const k of finalKept) {
    if (!k.verdict?.isInPerson) continue;
    const t = String(k.event.title || '').trim();
    if (!t) continue;
    const row = repeatTitles.get(t)
      || { Title: t, Type: k.verdict.activityType, Times: 0, years: new Set() };
    row.Times += 1;
    if (k.event.year) row.years.add(k.event.year);
    repeatTitles.set(t, row);
  }
  const repeatRows = [...repeatTitles.values()]
    .filter(r => r.Times > 2)
    .sort((a, b) => b.Times - a.Times)
    .map(r => ({ Title: r.Title, Type: r.Type, Times: r.Times, Years: [...r.years].sort().join(', ') }));
  const repeatTotal = repeatRows.reduce((n, r) => n + r.Times, 0);
  console.log(`\n--- In-person meetings from a title that repeats: ${repeatTotal} across ${repeatRows.length} titles (top 20) ---`);
  for (const r of repeatRows.slice(0, 20)) {
    console.log(`  ${String(r.Times).padStart(4)}  ${String(r.Type).padEnd(11)}  ${r.Title.slice(0, 55)}`);
  }

  const totalTravel = [...travelByYear.values()].reduce((n, s) => n + s.size, 0);
  console.log(`\n--- Days travelling to see clients: ${totalTravel} ---`);
  console.log(`--- Personal events excluded: ${personalRows.length} ---`);

  if (skippedInPerson.length) {
    console.log(`\n--- Warning: ${skippedInPerson.length} meetings the title calls in person sit in a bucket we would skip ---`);
    const byBucket = new Map();
    for (const s of skippedInPerson) byBucket.set(s.Bucket, (byBucket.get(s.Bucket) || 0) + 1);
    for (const [b, n] of [...byBucket].sort((a, b2) => b2[1] - a[1])) {
      console.log(`  ${String(n).padStart(6)}  ${b}`);
    }
    const titles = new Map();
    for (const s of skippedInPerson) {
      const k = `${s.Type}  |  ${s.Title.trim() || '(no title)'}`;
      titles.set(k, (titles.get(k) || 0) + 1);
    }
    console.log('  most common of those:');
    for (const [t, n] of [...titles].sort((a, b2) => b2[1] - a[1]).slice(0, 20)) {
      console.log(`    ${String(n).padStart(4)}  ${t.slice(0, 72)}`);
    }
  }

  // ── Workbook ───────────────────────────────────────────────────────────────

  if (OUT_DIR) {
    const wb = XLSX.utils.book_new();

    const totalTravelDays = [...travelByYear.values()].reduce((n, s) => n + s.size, 0);
    const summaryRows = [
      { Item: 'Events in the file',              Count: raws.length },
      { Item: `Older than ${START_YEAR} (set aside)`, Count: before2023 },
      ...order.filter(n => buckets.has(n)).map(n => ({ Item: n, Count: buckets.get(n) })),
      { Item: '', Count: '' },
      { Item: 'Collapsed — same time period as another meeting', Count: overlapDropped.length },
      { Item: 'Meetings that would become notes',   Count: finalKept.length },
      { Item: 'of those, read as in person',        Count: inPersonTotal },
      { Item: 'of those, no answer from the words', Count: typeCounts.get('(no answer)') || 0 },
      { Item: 'Days travelling to see clients',     Count: totalTravelDays },
      { Item: 'Personal events excluded',           Count: personalRows.length },
      { Item: 'Distinct titles the words missed',   Count: fallRows.length },
      { Item: 'In-person meetings still thrown away', Count: skippedInPerson.length },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

    const yearRows = years.map(y => {
      const c = byYear.get(y);
      return { Year: y, Coffee: c.COFFEE, Meals: c.MEAL, Golf: c.GOLF,
        'Happy hour': c.HAPPY_HOUR, 'Site visit': c.SITE_VISIT,
        'In person': c.inPerson, Events: c.EVENT,
        'Travel days': travelByYear.get(y)?.size ?? 0,
        'Notes that year': c.total };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(yearRows), 'By year');

    // Every day on the road, listed, so Mike can sanity-check the travel number.
    const travelRows = [];
    for (const y of [...travelByYear.keys()].sort()) {
      for (const day of [...travelByYear.get(y)].sort()) travelRows.push({ Year: y, Date: day });
    }
    if (travelRows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(travelRows), 'Travel days');
    }

    if (gradeRows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gradeRows), 'Vs Mikes counts');
    }
    if (repeatRows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(repeatRows), 'Repeating meetings');
    }
    if (overlapRows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overlapRows), 'Same time period');
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fallRows.slice(0, 500)), 'Titles missed');
    if (personalRows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(personalRows.slice(0, 2000)), 'Personal (excluded)');
    }
    if (skippedInPerson.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skippedInPerson), 'Would be thrown away');
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Every meeting');

    const out = path.join(OUT_DIR, 'Calendar dry run (2026-09-07).xlsx');
    XLSX.writeFile(wb, out);
    console.log(`\nWorkbook written: ${out}`);
  }

  console.log('\nNothing was written to the database. This was a read of the file only.');
}

main();
