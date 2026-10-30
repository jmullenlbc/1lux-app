// Admin > Calendar Upload (Mike 10-29): the .ics reader and the import plan.
// Synthetic calendars only; the real export holds personal events and never
// enters the repo.
// Run: node --test scripts/tests/calendarImport.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { unfold, parseStamp, readEvents } from '../../src/lib/calendar/ics.js';
import { planImport, checkImportEvent, importRef, batches, importedBody } from '../../src/lib/calendar/icsImport.js';

const ME = 'mike@ilcstudios.com';
const NOW = new Date('2025-06-01T00:00:00Z');

function ev({ uid, title, start, end, tz = '', location = '', guests = [], mine = 'ACCEPTED', extra = [] }) {
  const stamp = (name, v) => (tz ? `${name};TZID=${tz}:${v}` : `${name}:${v}`);
  return [
    'BEGIN:VEVENT',
    stamp('DTSTART', start),
    stamp('DTEND', end),
    `UID:${uid}`,
    `SUMMARY:${title}`,
    location && `LOCATION:${location}`,
    `ORGANIZER;CN=Mike:mailto:${ME}`,
    `ATTENDEE;CN=Mike;PARTSTAT=${mine}:mailto:${ME}`,
    ...guests.map(g => `ATTENDEE;CN=${g.split('@')[0]};PARTSTAT=ACCEPTED:mailto:${g}`),
    ...extra,
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}
const cal = (...events) => ['BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', ...events, 'END:VCALENDAR'].join('\r\n');

test('unfold joins wrapped lines', () => {
  assert.equal(unfold('SUMMARY:Coffee with\r\n  Bob'), 'SUMMARY:Coffee with Bob');
});

test('a TZID wall clock becomes the right instant, both sides of daylight saving', () => {
  assert.equal(parseStamp('20250115T090000', 'America/Denver').date.toISOString(), '2025-01-15T16:00:00.000Z');
  assert.equal(parseStamp('20250715T090000', 'America/Denver').date.toISOString(), '2025-07-15T15:00:00.000Z');
  assert.equal(parseStamp('20250715T090000Z').date.toISOString(), '2025-07-15T09:00:00.000Z');
});

test('an alarm inside an event does not overwrite it, and the mailbox answer is read', () => {
  const [e] = readEvents(cal(ev({
    uid: 'a1', title: 'Coffee with Bob', start: '20250310T150000Z', end: '20250310T160000Z',
    guests: ['bob@acme.com'], mine: 'TENTATIVE',
    extra: ['BEGIN:VALARM', 'DESCRIPTION:Reminder', 'TRIGGER:-PT10M', 'END:VALARM'],
  })));
  assert.equal(e.title, 'Coffee with Bob');
  assert.equal(e.body, undefined);
  assert.equal(e.attendees.find(a => a.email === ME).partstat, 'TENTATIVE');
});

const FILE = cal(
  ev({ uid: 'old', title: 'Coffee with Ann', start: '20220601T150000Z', end: '20220601T160000Z', guests: ['ann@acme.com'] }),
  ev({ uid: 'cof', title: 'Coffee with Bob', start: '20240310T150000Z', end: '20240310T160000Z', location: 'Starbucks', guests: ['bob@acme.com'] }),
  ev({ uid: 'dup', title: 'Coffee with Bob and Cy', start: '20240310T151500Z', end: '20240310T161500Z', location: 'Starbucks', guests: ['cy@acme.com'] }),
  ev({ uid: 'lun', title: 'Lunch with Dee', start: '20240411T180000Z', end: '20240411T190000Z', guests: ['dee@builder.com'] }),
  ev({ uid: 'dec', title: 'Golf with Eve', start: '20240501T150000Z', end: '20240501T200000Z', guests: ['eve@gc.com'], mine: 'DECLINED' }),
  ev({ uid: 'doc', title: 'Dentist', start: '20240601T150000Z', end: '20240601T160000Z', guests: ['front@smiles.com'] }),
  ev({ uid: 'int', title: 'Weekly standup', start: '20240701T150000Z', end: '20240701T160000Z', guests: ['sam@ilcstudios.com'] }),
  ev({ uid: 'fut', title: 'Lunch with Fay', start: '20250901T180000Z', end: '20250901T190000Z', guests: ['fay@dev.com'] }),
);

test('the plan keeps business meetings and leaves out the rest', () => {
  const plan = planImport(FILE, { startDate: '2023-01-01', now: NOW, mailbox: ME });
  assert.equal(plan.total, 8);
  assert.equal(plan.beforeStart, 1, 'before the start date');
  assert.equal(plan.personal, 1, 'the dentist');
  assert.ok(plan.skipped['not accepted'] >= 1, 'the declined golf');
  assert.ok(plan.skipped['internal only'] >= 1, 'ILC only standup');
  assert.equal(plan.collapsed, 1, 'overlapping coffees fold into one');
  const titles = plan.kept.map(k => k.title);
  assert.ok(!titles.includes('Dentist'));
  assert.ok(!titles.includes('Golf with Eve'));
  assert.equal(plan.byYear[2024].COFFEE, 1);
  assert.equal(plan.byYear[2024].MEAL, 1);
  assert.equal(plan.past, plan.kept.length - 1);
  assert.equal(plan.future, 1);
  assert.equal(plan.kept.find(k => k.title === 'Lunch with Fay').isPast, false);
});

test('a later start date drops earlier years; the same file plans the same refs', () => {
  const a = planImport(FILE, { startDate: '2024-04-01', now: NOW, mailbox: ME });
  assert.ok(!a.byYear[2024] || a.byYear[2024].COFFEE === 0);
  const b = planImport(FILE, { startDate: '2024-04-01', now: NOW, mailbox: ME });
  assert.deepEqual(a.kept.map(k => k.ref), b.kept.map(k => k.ref));
  assert.equal(importRef('lun', '2024-04-11T18:00:00Z'), 'ics:lun:2024-04-11T18:00:00.000Z');
});

test('travel days count each day once', () => {
  const plan = planImport(cal(
    ev({ uid: 't1', title: 'Flight to Denver', start: '20240902', end: '20240905', extra: [] }).replace(/DTSTART:/, 'DTSTART;VALUE=DATE:').replace(/DTEND:/, 'DTEND;VALUE=DATE:'),
  ), { now: NOW, mailbox: ME });
  assert.ok(plan.travelDays >= 1, `travel days ${plan.travelDays}`);
  assert.equal(plan.travelDays, plan.byYear[2024]?.travelDays ?? 0);
});

test('the server check refuses what the page should never have sent', () => {
  const plan = planImport(FILE, { now: NOW, mailbox: ME });
  const good = plan.kept.find(k => k.title === 'Lunch with Dee');
  const ok = checkImportEvent(good);
  assert.equal(ok.ok, true);
  assert.equal(ok.verdict.activityType, 'MEAL');
  assert.equal(ok.verdict.isInPerson, true);
  assert.equal(checkImportEvent({ ...good, title: 'Dentist' }).ok, false);
  assert.equal(checkImportEvent({ ...good, ref: 'outlook:1' }).ok, false);
  assert.equal(checkImportEvent({ ...good, title: 'Weekly standup', attendees: [{ email: 'sam@ilcstudios.com' }] }).ok, false);
  assert.match(importedBody(good, ok.verdict), /^Imported from the calendar upload\./);
});

test('batches split by size', () => {
  assert.deepEqual(batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
