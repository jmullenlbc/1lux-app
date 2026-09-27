// My Desk flags + Quick Note title (Mike 9-26). Pure rules only.
import assert from 'node:assert/strict';
import { outsideGuests, needsPerson, nameFromEmail, quickNoteTitle, stepIsFor } from '../../src/lib/desk/needsPerson.js';
import { isCheckInDue, pickOwner } from '../../src/lib/checkIns/checkIns.js';

const now = new Date('2026-09-26T15:00:00');
const day = n => new Date(now.getTime() - n * 86_400_000);
const guests = JSON.stringify([
  { email: 'mike@ilcstudios.com', name: 'Mike', isOrganizer: true },
  { email: 'Jane.Doe@Acme.com', name: '' },
  { email: 'sam@known.com', name: 'Sam' },
]);

// Our own people are never guests; emails are lower-cased.
assert.deepEqual(outsideGuests(guests).map(g => g.email), ['jane.doe@acme.com', 'sam@known.com']);
assert.equal(nameFromEmail('jane.doe@acme.com'), 'Jane Doe');

// An in-person meeting this week with an unknown guest is flagged; known guests are not.
const note = { isInPerson: true, meetingDate: day(2), attendees: guests, contactCount: 1 };
const f = needsPerson(note, new Set(['sam@known.com']), now);
assert.deepEqual(f.unknown.map(g => g.email), ['jane.doe@acme.com']);
assert.equal(f.nobody, false);

// Nobody on the note and no guests: flagged as "nobody".
assert.deepEqual(needsPerson({ isInPerson: true, meetingDate: day(1), attendees: '[]', contactCount: 0 }, new Set(), now), { unknown: [], nobody: true });
// Not flagged: everyone known, a call, older than a week, in the future, or put away.
assert.equal(needsPerson({ ...note }, new Set(['jane.doe@acme.com', 'sam@known.com']), now), null);
assert.equal(needsPerson({ ...note, isInPerson: false, activityType: 'CALL' }, new Set(), now), null);
assert.equal(needsPerson({ ...note, meetingDate: day(8) }, new Set(), now), null);
assert.equal(needsPerson({ ...note, meetingDate: new Date(now.getTime() + 3_600_000) }, new Set(), now), null);
assert.equal(needsPerson({ ...note, peopleSkippedAt: day(0) }, new Set(), now), null);

// Quick Note titles.
assert.equal(quickNoteTitle('COFFEE', [{ name: 'Jane Doe' }]), 'Coffee with Jane Doe');
assert.equal(quickNoteTitle('LUNCH', [{ name: 'A' }, { name: 'B' }, { name: 'C' }]), 'Meal with A, B and 1 more');
assert.equal(quickNoteTitle('', []), 'Note');

// Loose next steps go to the added person by name, or all of them when they are the only one.
assert.equal(stepIsFor('Jane', 'Jane Doe', false), true);
assert.equal(stepIsFor('jane doe', 'Jane Doe', false), true);
assert.equal(stepIsFor('Sam', 'Jane Doe', true), false);
assert.equal(stepIsFor('', 'Jane Doe', true), true);
assert.equal(stepIsFor(null, 'Jane Doe', false), false);

// Owner: person, then company, then last met; inactive users skipped.
assert.equal(pickOwner([null, 'u2', 'u3'], new Set(['u2', 'u3'])), 'u2');
assert.equal(pickOwner(['gone', null, 'u3'], new Set(['u3'])), 'u3');
assert.equal(pickOwner([null, null], new Set(['u3'])), null);

// Due flag lines up with the day-ahead email.
const c = { lastInPersonAt: new Date('2026-07-27T10:00:00') };
assert.equal(isCheckInDue(c, 60, new Date('2026-09-25T09:00:00')), true);
assert.equal(isCheckInDue(c, 60, new Date('2026-09-24T09:00:00')), false);

console.log('needsPerson: all passed');
