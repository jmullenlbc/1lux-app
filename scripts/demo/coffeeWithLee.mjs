/**
 * Demo: "Coffee with Lee" start to finish, on the LOCAL database with test data
 * (Mike 9-25: "We're just trying to do this with test data to show it works").
 *
 *   1. Lee's accepted coffee invite makes a draft sales note.
 *   2. The meeting notes go in and the note is published → next steps are read
 *      out of the words and switched on, and a recap email is drafted.
 *   3. Day 3:  Lee emails "Seattle drawings.pdf" → the drawings step closes itself.
 *   4. Day 15: nothing else has come → ONE check-in email is drafted (reminder 1).
 *   5. Day 18: Lee sends the lunch-and-learn invite → that step closes.
 *   6. Day 20: Lee introduces Dana → the last step closes and the unsent
 *      check-in is withdrawn, because it no longer needs to go.
 *   7. Day 31: the sweep finds nothing left to chase.
 *
 * Nothing is emailed, every draft waits in the Bot Queue. Refuses to run
 * against anything but a local SQLite file.
 *
 * Run: node --env-file=.env --import ./scripts/demo/alias.mjs scripts/demo/coffeeWithLee.mjs
 */
if (!/^file:/.test(process.env.DATABASE_URL || '')) {
  console.error('This demo only runs against the local SQLite database.');
  process.exit(1);
}

const { prisma } = await import('@/lib/db');
const { recordCalendarEvent } = await import('@/lib/calendar/recorder');
const { recordEmailMessage } = await import('@/lib/email/recorder');
const { extractActionsOnPublish } = await import('@/lib/notes/publishActions');
const { executeNotePublished } = await import('@/lib/bot/noteActionRunner');
const { sendDueWaitReminders } = await import('@/lib/followUp/engine');
const { waitStatus, ladderOf, isWaitExecutor } = await import('@/lib/followUp/watch');

const RUN = Date.now().toString(36);
const DAY = 86_400_000;
const MEETING = new Date('2026-09-24T09:00:00-07:00');
const day = n => new Date(MEETING.getTime() + n * DAY);
const MIKE = 'mike@ilcstudios.com';
const LEE = 'lee.busse@clearsky.test';
const DANA = 'dana.ortiz@clearsky.test';

const say = (...a) => console.log(...a);
const head = t => say(`\n━━ ${t} ${'━'.repeat(Math.max(0, 70 - t.length))}`);

// ── Test people ──────────────────────────────────────────────────────────────
const owner = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
if (!owner) { console.error('No admin user in the local database.'); process.exit(1); }

let client = await prisma.client.findFirst({ where: { name: 'Clear Sky (demo)' } });
if (!client) client = await prisma.client.create({ data: { name: 'Clear Sky (demo)', type: 'contractor', createdById: owner.id } });
let lee = await prisma.contact.findFirst({ where: { email: LEE } });
if (!lee) lee = await prisma.contact.create({ data: { name: 'Lee Busse', firstName: 'Lee', lastName: 'Busse', email: LEE, company: 'Clear Sky', clientId: client.id } });

let inbox = await prisma.emailAccount.findFirst({ where: { email: 'demo-inbox@ilcstudios.test' } });
if (!inbox) inbox = await prisma.emailAccount.create({ data: { email: 'demo-inbox@ilcstudios.test', provider: 'MOCK', accountType: 'USER', inboxRole: 'PERSONAL', displayName: 'Demo inbox' } });

// ── 1. The accepted invite ───────────────────────────────────────────────────
head('1. Sep 24: coffee invite accepted');
const cal = await recordCalendarEvent(prisma, {
  externalId: `demo-lee-coffee-${RUN}`,
  title: 'Coffee: Mike (ILC) / Lee (Clear Sky)',
  startAt: MEETING, endAt: new Date(MEETING.getTime() + 50 * 60_000),
  responseStatus: 'accepted', organizerEmail: MIKE,
  attendees: [{ name: 'Mike', email: MIKE }, { name: 'Lee Busse', email: LEE }],
}, { ownerUserId: owner.id, classification: { activityType: 'COFFEE', isInPerson: true, source: 'keyword', reason: '"Coffee" in the title' } });
say(`Draft note ${cal.status}: ${cal.reason || 'linked to Lee'}`);
const noteId = cal.noteId;

// ── 2. Notes typed in, published ─────────────────────────────────────────────
head('2. Notes written up and published');
const words = [
  'Coffee with Lee',
  '- Clear Sky wants a second set of eyes: ILC to peer review their lighting on two upcoming jobs.',
  '- Lee will send the Seattle drawings this week so we can start the peer review.',
  '- Lee will introduce me to Dana Ortiz, their precon lead.',
  '- Lee will send an invite for a lunch-and-learn with their PMs next month.',
  '- Next step for me: send Lee our peer review sample and fee sheet.',
].join('\n');
await prisma.note.update({ where: { id: noteId }, data: { body: words, meetingDate: MEETING, isPublished: true, publishedAt: new Date() } });
say(words.split('\n').map(l => `   ${l}`).join('\n'));

let extracted = 0;
try { extracted = (await extractActionsOnPublish(noteId)).created; }
catch (e) { say(`(AI read failed: ${e.message})`); }
if (!extracted) {
  // No AI key or no answer: the same steps the AI is told to find.
  say('(AI returned nothing, using the steps it is told to find)');
  const now = new Date();
  await prisma.noteAction.createMany({ data: [
    { type: 'SEND_MATERIALS', detail: 'Send Lee our peer review sample and fee sheet' },
    { type: 'EXPECT_DRAWINGS', detail: 'Lee sends the Seattle drawings' },
    { type: 'EXPECT_INTRO', detail: 'Lee introduces Dana Ortiz (precon lead)', targetName: 'Dana Ortiz' },
    { type: 'EXPECT_INVITE', detail: 'Lee sends a lunch-and-learn invite' },
  ].map(a => ({ ...a, noteId, rawText: a.detail, contactId: lee.id, contactName: lee.name, status: 'CONFIRMED', confirmedAt: now, source: 'ai' })) });
}
await executeNotePublished(noteId);

const types = new Map((await prisma.noteActionType.findMany()).map(t => [t.key, t]));
async function showSteps(now) {
  const rows = await prisma.noteAction.findMany({ where: { noteId, kind: 'ACTION' }, orderBy: { createdAt: 'asc' } });
  for (const a of rows) {
    const t = types.get(a.type);
    const line = isWaitExecutor(t?.executor)
      ? waitStatus(a, ladderOf(t, a), now).text
      : (a.botDraftId ? 'in the recap email (Bot Queue)' : a.status.toLowerCase());
    say(`   • ${(t?.label || a.type).padEnd(22)} ${a.detail || a.rawText}\n     ${' '.repeat(22)} → ${line}`);
  }
}
async function showDraft(id, label) {
  const d = id && await prisma.botDraft.findUnique({ where: { id }, select: { subject: true, body: true, status: true } });
  if (!d) return;
  say(`\n   ✉ ${label} [${d.status}]\n   Subject: ${d.subject}`);
  say(String(d.body || '').split('\n').slice(0, 14).map(l => `   | ${l}`).join('\n'));
}
await showSteps(new Date());
const recapId = (await prisma.noteAction.findFirst({ where: { noteId, botDraftId: { not: null } }, select: { botDraftId: true } }))?.botDraftId;
await showDraft(recapId, 'Recap email, waiting for review');

// ── 3. Day 3: drawings arrive ────────────────────────────────────────────────
head('3. Sep 27: Lee emails the drawings');
await recordEmailMessage(prisma, {
  externalId: `demo-lee-dwgs-${RUN}`, from: LEE, fromName: 'Lee Busse', to: [MIKE],
  subject: 'Seattle drawings', bodyPreview: 'Here you go, full set attached. Thanks for taking a look.',
  sentAt: day(3), attachments: [{ filename: 'Seattle drawings.pdf', mimeType: 'application/pdf', size: 3_200_000 }],
}, { accountId: inbox.id });
await showSteps(day(3));

// ── 4. Day 15: first reminder ────────────────────────────────────────────────
head('4. Oct 9: daily sweep, 15 days after the meeting');
const quiet = { notify: async () => ({ created: true }) };
say('   ', await sendDueWaitReminders(prisma, { now: day(15), ...quiet }));
const nudgeId = (await prisma.noteAction.findFirst({ where: { noteId, nudgeDraftId: { not: null } }, select: { nudgeDraftId: true } }))?.nudgeDraftId;
await showDraft(nudgeId, 'Check-in email, waiting for review');
await showSteps(day(15));

// ── 5. Day 18: the invite ────────────────────────────────────────────────────
head('5. Oct 12: Lee sends the lunch-and-learn invite');
await recordCalendarEvent(prisma, {
  externalId: `demo-lee-lnl-${RUN}`, title: 'ILC lunch-and-learn: Clear Sky PMs',
  startAt: day(35), createdAt: day(18), responseStatus: 'notResponded', organizerEmail: LEE,
  attendees: [{ name: 'Mike', email: MIKE }],
}, { ownerUserId: owner.id, classification: { activityType: 'MEAL', isInPerson: true, source: 'keyword', reason: 'lunch' } });
await showSteps(day(18));

// ── 6. Day 20: the intro ─────────────────────────────────────────────────────
head('6. Oct 14: Lee introduces Dana');
await recordEmailMessage(prisma, {
  externalId: `demo-lee-intro-${RUN}`, from: LEE, fromName: 'Lee Busse',
  to: [MIKE], cc: [DANA],
  subject: 'Intro: Mike (ILC) <> Dana (Clear Sky precon)', bodyPreview: 'Mike, meet Dana. She runs precon for us. I will let you two take it from here.',
  sentAt: day(20),
}, { accountId: inbox.id });
await showSteps(day(20));
if (nudgeId) {
  const n = await prisma.botDraft.findUnique({ where: { id: nudgeId }, select: { status: true } });
  say(`\n   The unsent check-in email is now: ${n?.status} (it no longer needs to go)`);
}

// ── 7. Day 31: nothing left ──────────────────────────────────────────────────
head('7. Oct 25: daily sweep, 31 days after the meeting');
say('   ', await sendDueWaitReminders(prisma, { now: day(31), ...quiet }));

say(`\nTest note: /crm/notes?note=${noteId}   (Lee Busse / Clear Sky (demo) are test records)`);
await prisma.$disconnect();
process.exit(0);
