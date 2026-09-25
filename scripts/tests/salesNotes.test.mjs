/**
 * Sales notes (2026-09-24 fixes): attendees keep calendar emails, the meeting
 * keeps its time, people links save, and "last met" moves only forward.
 *
 * Run: node --test scripts/tests/salesNotes.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attendeesToText, textToAttendees, toLocalInput, fromLocalInput } from '../../src/lib/noteAttendees.js';
import { addNoteLinks, setNoteContacts, stampLastMet } from '../../src/lib/noteLinks.js';

const CAL = JSON.stringify([{ name: 'Jane Smith', email: 'jane@x.com' }, { email: 'bob@y.com' }]);

test('calendar guests show as names, never [object Object]', () => {
  assert.equal(attendeesToText(CAL), 'Jane Smith, bob@y.com');
  assert.equal(attendeesToText('["Ann","Ben"]'), 'Ann, Ben');
  assert.equal(attendeesToText('not json'), '');
});

test('saving keeps a guest\'s email while their name is still there', () => {
  const out = JSON.parse(textToAttendees('Jane Smith, bob@y.com, New Person', CAL));
  assert.deepEqual(out, [{ name: 'Jane Smith', email: 'jane@x.com' }, { email: 'bob@y.com' }, 'New Person']);
  assert.deepEqual(JSON.parse(textToAttendees('', CAL)), []);
});

test('meeting time survives the round trip', () => {
  const iso = fromLocalInput('2026-09-24T14:30');
  assert.equal(toLocalInput(iso), '2026-09-24T14:30');
  assert.equal(fromLocalInput(''), null);
  // An old date-only value lands at noon, so no time zone can move its day.
  assert.equal(toLocalInput(fromLocalInput('2026-09-24')).slice(0, 10), '2026-09-24');
});

// A tiny in-memory stand-in for the three link tables and Contact.
function fakeDb(contacts = {}) {
  const rows = { noteClient: [], noteProject: [], noteContact: [] };
  const table = (name) => ({
    findMany: async ({ where }) => rows[name].filter(r => r.noteId === where.noteId && Object.entries(where)
      .every(([k, v]) => k === 'noteId' || (v?.in ? v.in.includes(r[k]) : true))),
    createMany: async ({ data }) => { rows[name].push(...data); },
    deleteMany: async ({ where }) => {
      const [k, v] = Object.entries(where).find(([key]) => key !== 'noteId');
      rows[name] = rows[name].filter(r => !(r.noteId === where.noteId && v.in.includes(r[k])));
    },
  });
  return {
    rows,
    noteClient: table('noteClient'), noteProject: table('noteProject'), noteContact: table('noteContact'),
    contact: {
      findUnique: async ({ where }) => contacts[where.id] ?? null,
      update: async ({ where, data }) => { Object.assign(contacts[where.id], data); },
    },
  };
}

test('links are never added twice', async () => {
  const db = fakeDb();
  await addNoteLinks(db, 'client', 'n1', ['c1', 'c1', null]);
  await addNoteLinks(db, 'client', 'n1', ['c1', 'c2']);
  assert.deepEqual(db.rows.noteClient.map(r => r.clientId), ['c1', 'c2']);
});

test('the editor\'s people list replaces the note\'s people', async () => {
  const db = fakeDb();
  await setNoteContacts(db, 'n1', ['a', 'b']);
  await setNoteContacts(db, 'n1', ['b', 'c']);
  assert.deepEqual(db.rows.noteContact.map(r => r.contactId).sort(), ['b', 'c']);
});

test('"last met" moves forward only', async () => {
  const people = {
    old: { lastInPersonAt: new Date('2026-01-01'), lastTouchpointAt: new Date('2026-01-01') },
    newer: { lastInPersonAt: new Date('2026-12-01'), lastTouchpointAt: new Date('2026-12-01') },
  };
  const db = fakeDb(people);
  await setNoteContacts(db, 'n1', ['old', 'newer']);
  await stampLastMet(db, 'n1', '2026-09-24T14:30:00Z');
  assert.equal(people.old.lastInPersonAt.toISOString(), '2026-09-24T14:30:00.000Z');
  assert.equal(people.newer.lastInPersonAt.toISOString(), '2026-12-01T00:00:00.000Z');
});
