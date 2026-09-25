/**
 * Follow-up watch (Mike 9-25): after a meeting, steps that are THEIRS to do
 * (reply, drawings, invite, intro) close themselves when the email or invite
 * arrives; otherwise one check-in draft per person goes to the Bot Queue on the
 * 14 / 30 / 60-day ladder. Nothing is ever sent automatically.
 *
 * Run: node --test scripts/tests/followUp.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { emailFulfills, eventFulfills, ladderOf, waitStatus, nextRemindAt } from '../../src/lib/followUp/watch.js';
import { sendDueWaitReminders, matchEmailToWaits, nextRungAfterSend, firstRemindAt } from '../../src/lib/followUp/engine.js';
import { followUpSubject, wasEdited, editExamples, editExamplesSection } from '../../src/lib/bot/editLearning.js';

const DAY = 86_400_000;
const MEETING = new Date('2026-09-24T16:00:00Z');
const day = n => new Date(MEETING.getTime() + n * DAY);
const LEE = { contactEmail: 'lee@clearsky.test', contactName: 'Lee Busse', since: MEETING };
const fromLee = extra => ({ fromEmail: 'lee@clearsky.test', to: '[{"email":"mike@ilcstudios.com"}]', sentAt: day(3), ...extra });

// ── Does this email do it? ──────────────────────────────────────────────────

test('drawings: a PDF from them counts; a signature logo does not', () => {
  const hit = emailFulfills('EXPECT_FILES', fromLee({ attachments: [{ filename: 'Seattle drawings.pdf' }] }), LEE);
  assert.equal(hit.note, 'Lee sent Seattle drawings.pdf');
  assert.equal(emailFulfills('EXPECT_FILES', fromLee({ attachments: [{ filename: 'logo.png' }] }), LEE), null);
});

test('drawings: a Dropbox link counts; the same PDF from someone else does not', () => {
  assert.match(emailFulfills('EXPECT_FILES', fromLee({ bodyPreview: 'set is at https://www.dropbox.com/s/x' }), LEE).note, /Dropbox link/);
  assert.equal(emailFulfills('EXPECT_FILES', { ...fromLee({ attachments: [{ filename: 'a.pdf' }] }), fromEmail: 'x@y.test' }, LEE), null);
});

test('reply: any email from them; not a calendar invite, not an auto-reply, not one sent before the meeting', () => {
  assert.ok(emailFulfills('EXPECT_REPLY', fromLee({ subject: 'Re: coffee' }), LEE));
  assert.equal(emailFulfills('EXPECT_REPLY', fromLee({ isCalendarInvite: true }), LEE), null);
  assert.equal(emailFulfills('EXPECT_REPLY', fromLee({ isAutomated: true }), LEE), null);
  assert.equal(emailFulfills('EXPECT_REPLY', fromLee({ sentAt: day(-2) }), LEE), null);
});

test('invite: only a calendar invite from them', () => {
  assert.ok(emailFulfills('EXPECT_INVITE', fromLee({ isCalendarInvite: true, subject: 'Lunch and learn' }), LEE));
  assert.equal(emailFulfills('EXPECT_INVITE', fromLee({}), LEE), null);
});

test('intro: them plus someone new, named from the note when the address has no name', () => {
  const email = fromLee({ cc: '[{"email":"dana.ortiz@clearsky.test"}]', subject: 'Intro' });
  const hit = emailFulfills('EXPECT_INTRO', email, { ...LEE, targetName: 'Dana Ortiz' });
  assert.equal(hit.note, 'Lee introduced you to Dana Ortiz (dana.ortiz@clearsky.test)');
  // Only ILC people besides them: not an intro.
  assert.equal(emailFulfills('EXPECT_INTRO', fromLee({ cc: '[{"email":"sean@ilcstudios.com"}]' }), LEE), null);
  // Someone new, but not the person named on the note.
  assert.equal(emailFulfills('EXPECT_INTRO', fromLee({ cc: '[{"email":"pat@other.test"}]' }), { ...LEE, targetName: 'Dana Ortiz' }), null);
});

test('calendar: an invite they organized after the meeting counts; the meeting itself does not', () => {
  assert.ok(eventFulfills('EXPECT_INVITE', { organizerEmail: 'LEE@clearsky.test', title: 'L&L', createdAt: day(18) }, LEE));
  assert.equal(eventFulfills('EXPECT_INVITE', { organizerEmail: 'lee@clearsky.test', startAt: MEETING }, LEE), null);
  assert.equal(eventFulfills('EXPECT_REPLY', { organizerEmail: 'lee@clearsky.test', createdAt: day(18) }, LEE), null);
});

// ── The ladder ──────────────────────────────────────────────────────────────

test('ladder: blanks and out-of-order rungs are dropped; a step can override its first rung', () => {
  assert.deepEqual(ladderOf({ reminderDays: 14, reminder2Days: 30, reminder3Days: 60 }), [14, 30, 60]);
  assert.deepEqual(ladderOf({ reminderDays: 14, reminder2Days: null, reminder3Days: 60 }), [14, 60]);
  assert.deepEqual(ladderOf({ reminderDays: 30, reminder2Days: 14 }), [30]);
  assert.deepEqual(ladderOf({ reminderDays: 14, reminder2Days: 30 }, { reminderDays: 7 }), [7, 30]);
  assert.equal(nextRemindAt(MEETING, [14, 30], 2), null);
});

test('a late sweep never lands two reminders on back-to-back days', () => {
  const next = nextRungAfterSend(MEETING, [7, 14, 30], 1, day(15)); // rung 2 (day 14) already gone by
  assert.equal(next.getTime(), day(22).getTime());                  // pushed out by the 7-day gap
  assert.equal(nextRungAfterSend(MEETING, [14, 30], 1, day(15)).getTime(), day(30).getTime());
});

test('re-published after a pause: the ladder resumes on the rung it was on', () => {
  const type = { reminderDays: 14, reminder2Days: 30, reminder3Days: 60 };
  assert.equal(firstRemindAt({ confirmedAt: day(1) }, type, { meetingDate: MEETING }).getTime(), day(14).getTime());
  assert.equal(firstRemindAt({ confirmedAt: day(1), reminderCount: 2 }, type, { meetingDate: MEETING }).getTime(), day(60).getTime());
  assert.equal(firstRemindAt({ reminderCount: 3 }, type, { meetingDate: MEETING }), null);
});

test('status words on the Notes tab', () => {
  assert.equal(waitStatus({ fulfilledAt: day(3), fulfilledNote: 'Lee sent a.pdf' }).state, 'done');
  assert.equal(waitStatus({ status: 'CONFIRMED', reminderCount: 3 }, [14, 30, 60]).text, 'No answer after 3 reminders');
  assert.match(waitStatus({ status: 'CONFIRMED', remindAt: day(14) }, [14, 30, 60], day(1)).text, /reminder 1 of 3 on/);
});

// ── The database side, on a fake database ──────────────────────────────────

function fakeDb() {
  const note = { id: 'n1', title: 'Coffee with Lee', meetingDate: MEETING, isPublished: true, archivedAt: null, createdById: 'mike', calendarRef: 'ev-coffee' };
  const types = [
    { key: 'EXPECT_DRAWINGS', label: 'Expect drawings', executor: 'EXPECT_FILES',  reminderDays: 14, reminder2Days: 30, reminder3Days: 60 },
    { key: 'EXPECT_INTRO',    label: 'Expect intro',    executor: 'EXPECT_INTRO',  reminderDays: 14, reminder2Days: 30, reminder3Days: null },
    { key: 'SEND_MATERIALS',  label: 'Send materials',  executor: 'SEND_MATERIALS' },
  ];
  const act = (id, type, extra = {}) => ({ id, noteId: 'n1', kind: 'ACTION', type, status: 'CONFIRMED', contactId: 'lee', contactName: 'Lee Busse',
    detail: id, confirmedAt: day(1), remindAt: day(14), reminderCount: 0, fulfilledAt: null, nudgeDraftId: null, ...extra });
  const db = {
    actions: [act('dwgs', 'EXPECT_DRAWINGS'), act('intro', 'EXPECT_INTRO', { targetName: 'Dana Ortiz' }), act('mats', 'SEND_MATERIALS', { remindAt: null })],
    drafts: [], alerts: [],
    noteAction: {
      findMany: async ({ where }) => db.actions
        .filter(a => a.status === where.status && a.fulfilledAt == null
          && (!where.remindAt || (a.remindAt && a.remindAt <= where.remindAt.lte))
          && (!where.contactId || where.contactId.in.includes(a.contactId)))
        .map(a => ({ ...a, note })),
      update: async ({ where, data }) => Object.assign(db.actions.find(a => a.id === where.id), data),
      count:  async ({ where }) => db.actions.filter(a => a.nudgeDraftId === where.nudgeDraftId && a.fulfilledAt == null && a.status === 'CONFIRMED').length,
    },
    noteActionType: { findMany: async ({ where }) => types.filter(t => where.key.in.includes(t.key)) },
    contact:        { findMany: async () => [{ id: 'lee', name: 'Lee Busse', email: 'lee@clearsky.test' }] },
    botDraft: {
      create: async ({ data }) => { const d = { id: `d${db.drafts.length + 1}`, ...data }; db.drafts.push(d); return d; },
      updateMany: async ({ where, data }) => { for (const d of db.drafts) if (d.id === where.id && d.status === where.status) Object.assign(d, data); },
    },
    emailMessage: { findUnique: async () => ({ id: 'm1', ...fromLee({ sentAt: day(16), cc: '[{"email":"dana.ortiz@clearsky.test"}]', attachments: [{ filename: 'Seattle.pdf' }] }), contactLinks: [{ contactId: 'lee' }] }) },
  };
  return db;
}
const opts = db => ({
  compose: async g => ({ subject: `Checking in (${g.actions.length})`, body: g.actions.map(a => a.waitingFor).join(',') }),
  notify:  async a => { db.alerts.push(a); return { created: true }; },
});

test('sweep: two overdue steps for one person make ONE draft for review, and move to the next rung', async () => {
  const db = fakeDb();
  const log = await sendDueWaitReminders(db, { now: day(15), ...opts(db) });
  assert.deepEqual(log, { due: 2, drafted: 1, notified: 1, finished: 0, skipped: 0 });
  assert.equal(db.drafts.length, 1);
  assert.equal(db.drafts[0].status, 'PENDING_REVIEW');
  assert.equal(db.drafts[0].body, 'FILES,INTRO');
  const [dwgs, intro] = db.actions;
  assert.equal(dwgs.reminderCount, 1);
  assert.equal(dwgs.remindAt.getTime(), day(30).getTime());
  assert.equal(intro.nudgeDraftId, 'd1');
  // Nothing due until day 30.
  assert.equal((await sendDueWaitReminders(db, { now: day(20), ...opts(db) })).due, 0);
});

test('sweep: after the last rung the step stops asking', async () => {
  const db = fakeDb();
  db.actions[1].reminderCount = 1; db.actions[1].remindAt = day(30);
  db.actions[0].remindAt = day(99);
  const log = await sendDueWaitReminders(db, { now: day(31), ...opts(db) });
  assert.equal(log.finished, 1);
  assert.equal(db.actions[1].remindAt, null);
  assert.equal(waitStatus(db.actions[1], [14, 30]).text, 'No answer after 2 reminders');
});

test('email arrives: every step it does is closed, and the unsent check-in is withdrawn', async () => {
  const db = fakeDb();
  await sendDueWaitReminders(db, { now: day(15), ...opts(db) });
  const closed = await matchEmailToWaits(db, 'm1', opts(db));
  assert.deepEqual(closed.map(c => c.actionId).sort(), ['dwgs', 'intro']);
  assert.equal(db.actions[0].status, 'DONE');
  assert.equal(db.actions[0].fulfilledByEmailId, 'm1');
  assert.equal(db.actions[2].status, 'CONFIRMED'); // our own step is untouched
  assert.equal(db.drafts[0].status, 'CANCELLED');
});

test('an unpublished note is left alone by the sweep', async () => {
  const db = fakeDb();
  const find = db.noteAction.findMany;
  db.noteAction.findMany = async args => (await find(args)).map(a => ({ ...a, note: { ...a.note, isPublished: false } }));
  const log = await sendDueWaitReminders(db, { now: day(15), ...opts(db) });
  assert.equal(log.skipped, 2);
  assert.equal(db.drafts.length, 0);
});

// ── Learning from edits + the subject line (Mike 9-25) ───────────────────────

test('subject names the meeting, never the day', () => {
  assert.equal(followUpSubject('COFFEE'), 'Coffee follow-up');
  assert.equal(followUpSubject('MEAL', 'Dinner w/ Lee'), 'Dinner follow-up');
  assert.equal(followUpSubject('MEAL', 'Lee'), 'Lunch follow-up');
  assert.equal(followUpSubject(null), 'Meeting follow-up');
});

test('only emails a person rewrote and sent become lessons', async () => {
  assert.equal(wasEdited({ aiBody: 'Hi Lee,\nThanks', body: 'Hi Lee,  \nThanks' }), false); // spacing only
  assert.equal(wasEdited({ aiBody: 'Hi Lee', body: 'Lee —' }), true);
  assert.equal(wasEdited({ aiBody: 'x', body: 'x', aiSubject: 'Coffee follow-up', subject: 'Great coffee' }), true);
  assert.equal(wasEdited({ aiBody: null, body: 'x' }), false);
  const rows = [
    { subject: 'S', body: 'Mike wrote this', aiSubject: 'S', aiBody: 'Bot wrote this' },
    { subject: 'S', body: 'same', aiSubject: 'S', aiBody: 'same' },
  ];
  let asked;
  const db = { botDraft: { findMany: async a => { asked = a; return rows; } } };
  const got = await editExamples(db, 'RECAP');
  assert.deepEqual(asked.where.status.in, ['SENT', 'MANUALLY_SENT']);
  assert.equal(asked.where.emailKind, 'RECAP');
  assert.equal(got.length, 1);
  const block = editExamplesSection(got);
  assert.match(block, /WHAT THE BOT WROTE:[\s\S]*Bot wrote this[\s\S]*WHAT MIKE ACTUALLY SENT:[\s\S]*Mike wrote this/);
  assert.equal(editExamplesSection([]), '');
});
