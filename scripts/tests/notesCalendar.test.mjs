/**
 * Sales notes and the calendar (Mike 9-25): only accepted invites make notes, a
 * decline archives the draft, the owner is the salesperson on the invite, a
 * pasted calendar link joins a hand-made note to its meeting, prep runs before
 * the meeting, and the list reads as an agenda.
 *
 * Run: node --test scripts/tests/notesCalendar.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickSalesOwner, pickSalesOwners, eventIdFromLink, linkMatchesEvent, cleanCalendarLink } from '../../src/lib/calendar/salesOwner.js';
import { recordCalendarEvent } from '../../src/lib/calendar/recorder.js';
import { groupNotesForAgenda, agendaGroup, defaultNoteTab } from '../../src/lib/notes/agenda.js';
import { prepDueWhere, shouldAutoPrep, PREP_AHEAD_HOURS } from '../../src/lib/meetingPrep/due.js';
import { SALES_MARKETING } from '../../src/lib/departments.js';

const NOW = new Date('2026-09-25T12:00:00Z');
const hours = n => new Date(NOW.getTime() + n * 3_600_000);

// ── Owner ───────────────────────────────────────────────────────────────────

const USERS = [
  { id: 'ops',   email: 'ops@ilcstudios.com',   departments: [{ department: 'OPERATIONS' }] },
  { id: 'sales', email: 'Sales@ilcstudios.com', departments: [{ department: SALES_MARKETING }] },
];

test('the salesperson on the invite owns the note, even when someone else sent it', () => {
  const event = { organizerEmail: 'ops@ilcstudios.com', attendees: [{ email: 'client@x.com' }, { email: 'sales@ILCstudios.com' }] };
  assert.equal(pickSalesOwner(event, USERS), 'sales');
});

test('no salesperson on the invite: the first ILC person owns it; nobody from ILC: no owner', () => {
  assert.equal(pickSalesOwner({ organizerEmail: 'ops@ilcstudios.com' }, USERS), 'ops');
  assert.equal(pickSalesOwner({ organizerEmail: 'client@x.com', attendees: [{ email: 'b@y.com' }] }, USERS), null);
});

test('every salesperson on the invite owns the note (0108); else the first ILC person', () => {
  const two = [...USERS, { id: 'sales2', email: 'sam@ilcstudios.com', departments: [{ department: SALES_MARKETING }] }];
  const event = { organizerEmail: 'ops@ilcstudios.com', attendees: [{ email: 'sam@ilcstudios.com' }, { email: 'sales@ilcstudios.com' }] };
  assert.deepEqual(pickSalesOwners(event, two), ['sales2', 'sales']);
  assert.deepEqual(pickSalesOwners(event, two, { mailbox: 'sales@ilcstudios.com' }), ['sales', 'sales2']);
  assert.deepEqual(pickSalesOwners({ organizerEmail: 'ops@ilcstudios.com' }, USERS), ['ops']);
  assert.deepEqual(pickSalesOwners({ organizerEmail: 'client@x.com' }, USERS), []);
});

// ── Calendar link ───────────────────────────────────────────────────────────

test('an Outlook link is matched to its event', () => {
  const link = 'https://outlook.office.com/calendar/item/AAMk%3D%3D';
  assert.equal(eventIdFromLink(link), 'AAMk==');
  assert.equal(eventIdFromLink('https://outlook.office.com/owa/?itemid=XYZ&exvsurl=1'), 'XYZ');
  assert.equal(linkMatchesEvent(link, { externalId: 'AAMk==' }), true);
  assert.equal(linkMatchesEvent(link, { externalId: 'other' }), false);
  assert.equal(linkMatchesEvent('https://a.b/c', { webUrl: 'https://a.b/c' }), true);
  assert.equal(linkMatchesEvent('', { externalId: 'AAMk==' }), false);
});

test('only web addresses are saved as a calendar link', () => {
  assert.equal(cleanCalendarLink('  https://x.com/e  '), 'https://x.com/e');
  assert.equal(cleanCalendarLink(''), null);
  assert.equal(cleanCalendarLink(null), null);
  assert.equal(cleanCalendarLink('javascript:alert(1)'), undefined);
  assert.equal(cleanCalendarLink('see the invite'), undefined);
  assert.equal(cleanCalendarLink('https://x.com/' + 'a'.repeat(2000)), undefined);
});

// ── The sync ────────────────────────────────────────────────────────────────

function fakeDb(notes = []) {
  const contactLinks = [];
  const owners = [];
  let n = 0;
  const match = (row, where) => Object.entries(where).every(([k, v]) => {
    if (v === null) return row[k] == null;
    if (v && typeof v === 'object' && 'not' in v) return row[k] != null;
    return row[k] === v;
  });
  return {
    notes, contactLinks, owners,
    noteOwner: {
      findMany: async ({ where }) => owners.filter(o => o.noteId === where.noteId && where.userId.in.includes(o.userId)),
      create:   async ({ data }) => { owners.push(data); return data; },
      count:    async ({ where }) => owners.filter(o => o.noteId === where.noteId).length,
    },
    note: {
      findFirst:  async ({ where }) => notes.find(r => match(r, where)) ?? null,
      findMany:   async ({ where }) => notes.filter(r => match(r, where)),
      update:     async ({ where, data }) => Object.assign(notes.find(r => r.id === where.id), data),
      create:     async ({ data }) => { const row = { id: `n${++n}`, archivedAt: null, archivedById: null, ...data }; notes.push(row); return { id: row.id }; },
      aggregate:  async () => ({ _max: { noteNumber: notes.length } }),
    },
    contact: { findMany: async () => [{ id: 'jane', email: 'Jane@Client.com' }] },
    noteContact: {
      findMany:   async ({ where }) => contactLinks.filter(r => r.noteId === where.noteId && where.contactId.in.includes(r.contactId)),
      createMany: async ({ data }) => { contactLinks.push(...data); },
    },
  };
}

const VERDICT = { activityType: 'SITE_VISIT', isInPerson: true, source: 'keyword', reason: 'test' };
const EVENT = { externalId: 'ev1', title: 'Site walk', startAt: hours(24), responseStatus: 'accepted',
                attendees: [{ name: 'Jane', email: 'jane@client.com' }] };

test('an accepted invite makes one draft, owned and linked, and a re-sync does not make a second', async () => {
  const db = fakeDb();
  const a = await recordCalendarEvent(db, EVENT, { ownerUserId: 'sales', classification: VERDICT });
  assert.deepEqual(db.owners.map(o => [o.noteId, o.userId, o.source]), [[a.noteId, 'sales', 'calendar']]);
  assert.equal(a.status, 'created');
  assert.equal(db.notes[0].createdById, 'sales');
  assert.equal(db.notes[0].isPublished, false);
  assert.deepEqual(db.contactLinks.map(l => l.contactId), ['jane']);
  const b = await recordCalendarEvent(db, EVENT, { ownerUserId: 'sales', classification: VERDICT });
  assert.equal(b.status, 'updated');
  assert.equal(db.notes.length, 1);
  assert.equal(db.contactLinks.length, 1);
});

test('an invite that was never accepted makes no note', async () => {
  const db = fakeDb();
  for (const responseStatus of ['declined', 'notResponded', 'tentativelyAccepted']) {
    const r = await recordCalendarEvent(db, { ...EVENT, responseStatus }, { classification: VERDICT });
    assert.equal(r.status, 'skipped');
  }
  assert.equal(db.notes.length, 0);
});

test('declined after accepting archives the draft; accepting again brings it back', async () => {
  const db = fakeDb();
  await recordCalendarEvent(db, EVENT, { classification: VERDICT });
  const d = await recordCalendarEvent(db, { ...EVENT, responseStatus: 'declined' }, { classification: VERDICT });
  assert.equal(d.status, 'archived');
  assert.ok(db.notes[0].archivedAt);
  assert.equal(db.notes[0].archivedById, null);
  const c = await recordCalendarEvent(db, { ...EVENT, isCancelled: true }, { classification: VERDICT });
  assert.equal(c.status, 'archived');
  await recordCalendarEvent(db, EVENT, { classification: VERDICT });
  assert.equal(db.notes[0].archivedAt, null);
});

test('a note a person archived stays archived when the invite is accepted again', async () => {
  const db = fakeDb([{ id: 'x', calendarRef: 'ev1', isPublished: false, archivedAt: NOW, archivedById: 'mike' }]);
  const r = await recordCalendarEvent(db, EVENT, { classification: VERDICT });
  assert.equal(r.status, 'left alone');
  assert.equal(db.notes[0].archivedAt, NOW);
});

test('a published note is never archived or rewritten by the sync', async () => {
  const db = fakeDb([{ id: 'p', calendarRef: 'ev1', isPublished: true, title: 'Mine', archivedAt: null }]);
  const r = await recordCalendarEvent(db, { ...EVENT, responseStatus: 'declined' }, { classification: VERDICT });
  assert.equal(r.status, 'left alone');
  assert.equal(db.notes[0].archivedAt, null);
  assert.equal(db.notes[0].title, 'Mine');
});

test('a hand-made note with the event\'s calendar link is joined, not duplicated', async () => {
  const db = fakeDb([{ id: 'h', noteType: 'SALES', calendarRef: null, title: 'My words', body: 'typed',
                       meetingLink: 'https://outlook.office.com/calendar/item/ev1', meetingDate: null, attendees: null,
                       createdById: null, activityType: 'MEAL', isPublished: false, archivedAt: null }]);
  const r = await recordCalendarEvent(db, EVENT, { ownerUserId: 'sales', classification: VERDICT });
  assert.equal(r.status, 'linked');
  assert.equal(db.notes.length, 1);
  const h = db.notes[0];
  assert.equal(h.calendarRef, 'ev1');
  assert.equal(h.title, 'My words');
  assert.equal(h.activityType, 'MEAL');
  assert.equal(h.createdById, 'sales');
  assert.deepEqual(h.meetingDate, EVENT.startAt);
  assert.deepEqual(db.contactLinks.map(l => l.contactId), ['jane']);
});

test('a draft with no owner gets the salesperson on the next sync', async () => {
  const db = fakeDb([{ id: 'o', calendarRef: 'ev1', isPublished: false, createdById: null, archivedAt: null, classificationSource: 'manual' }]);
  await recordCalendarEvent(db, EVENT, { ownerUserId: 'sales', classification: VERDICT });
  assert.equal(db.notes[0].createdById, 'sales');
});

// ── Agenda + prep ───────────────────────────────────────────────────────────

test('the list reads as an agenda: coming up soonest first, then needs notes, then done', () => {
  const notes = [
    { id: 'later',  meetingDate: hours(48) },
    { id: 'soon',   meetingDate: hours(2) },
    { id: 'past',   meetingDate: hours(-5) },
    { id: 'older',  meetingDate: hours(-50) },
    { id: 'nodate', updatedAt: hours(-1) },
    { id: 'pub',    meetingDate: hours(-3), isPublished: true },
  ];
  const g = groupNotesForAgenda(notes, NOW);
  assert.deepEqual(g.upcoming.map(n => n.id), ['soon', 'later']);
  assert.deepEqual(g.needsNotes.map(n => n.id), ['nodate', 'past', 'older']);
  assert.deepEqual(g.done.map(n => n.id), ['pub']);
  assert.equal(agendaGroup({ meetingDate: hours(1), isPublished: true }, NOW), 'done');
});

test('a note opens on Prep before the meeting and on Notes after it', () => {
  assert.equal(defaultNoteTab({ meetingDate: hours(3) }, { canPrep: true, now: NOW }), 'prep');
  assert.equal(defaultNoteTab({ meetingDate: hours(-3) }, { canPrep: true, now: NOW }), 'notes');
  assert.equal(defaultNoteTab({ meetingDate: hours(3) }, { canPrep: false, now: NOW }), 'notes');
});

test('prep builds itself only for a future draft with something linked and no brief', () => {
  const linked = { meetingDate: hours(5), clients: [{ clientId: 'c' }] };
  assert.equal(shouldAutoPrep(linked, false, NOW), true);
  assert.equal(shouldAutoPrep(linked, true, NOW), false);
  assert.equal(shouldAutoPrep({ ...linked, isPublished: true }, false, NOW), false);
  assert.equal(shouldAutoPrep({ ...linked, meetingDate: hours(-1) }, false, NOW), false);
  assert.equal(shouldAutoPrep({ meetingDate: hours(5) }, false, NOW), false);
});

test('the before-the-meeting sweep looks two days ahead at unpublished sales drafts', () => {
  const w = prepDueWhere(NOW);
  assert.equal(w.noteType, 'SALES');
  assert.equal(w.isPublished, false);
  assert.deepEqual(w.meetingDate.gte, NOW);
  assert.deepEqual(w.meetingDate.lte, hours(PREP_AHEAD_HOURS));
  assert.equal(w.OR.length, 3);
});
