// The reminder that never leaves (Mike, 2026-09-15): calendar drafts never
// expire, and a banner stays on every page until each one is published.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draftReminderWhere, isReminderDraft, draftReminderText } from '../../src/lib/calendar/draftReminder.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = rel => readFileSync(join(ROOT, rel), 'utf8');

const NOW = new Date('2026-09-15T12:00:00Z');
const base = {
  createdById: 'u1', calendarRef: 'evt-1', isPublished: false, archivedAt: null,
  meetingDate: '2026-09-10T15:00:00Z',
};

test('the database rule: mine, from the calendar, unpublished, not archived, already happened', () => {
  assert.deepEqual(draftReminderWhere('u1', NOW), {
    owners:      { some: { userId: 'u1' } },
    calendarRef: { not: null },
    isPublished: false,
    archivedAt:  null,
    OR: [{ meetingDate: null }, { meetingDate: { lte: NOW } }],
  });
});

test('the on-screen rule agrees with the database rule', () => {
  assert.equal(isReminderDraft(base, 'u1', NOW), true);
  assert.equal(isReminderDraft({ ...base, meetingDate: null }, 'u1', NOW), true, 'no date still waits');
  assert.equal(isReminderDraft({ ...base, createdById: 'u2' }, 'u1', NOW), false, "someone else's");
  assert.equal(isReminderDraft({ ...base, calendarRef: null }, 'u1', NOW), false, 'typed by hand, not from the calendar');
  assert.equal(isReminderDraft({ ...base, isPublished: true }, 'u1', NOW), false, 'published');
  assert.equal(isReminderDraft({ ...base, archivedAt: NOW }, 'u1', NOW), false, 'archived');
  assert.equal(isReminderDraft({ ...base, meetingDate: '2026-09-20T15:00:00Z' }, 'u1', NOW), false, 'meeting not happened yet');
  assert.equal(isReminderDraft(base, null, NOW), false);
});

test('there is no expiry: a year-old draft still counts', () => {
  assert.equal(isReminderDraft({ ...base, meetingDate: '2025-09-01T00:00:00Z' }, 'u1', NOW), true);
  assert.doesNotMatch(read('src/lib/calendar/draftReminder.js'), /gte|MAX_|days/i);
});

test('plain-English wording', () => {
  assert.equal(draftReminderText(0), '');
  assert.equal(draftReminderText(1), '1 meeting from your calendar still needs its note published.');
  assert.equal(draftReminderText(4), '4 meetings from your calendar still need their notes published.');
});

test('the count route is signed-in only and counts only my own drafts', () => {
  const src = read('src/app/api/crm/notes/drafts-reminder/route.js');
  assert.match(src, /requireAuth\(\)/);
  assert.match(src, /draftReminderWhere\(user\.id\)/);
});

test('no page wide banner; the reminder lives in Sales Notes and My Desk (Mike 10-29)', () => {
  assert.doesNotMatch(read('src/app/(app)/layout.jsx'), /DraftReminderBanner/);
  assert.match(read('src/app/(app)/crm/notes/NotesClient.jsx'), /setStatusFilter\('mine'\)/);
  assert.match(read('src/app/(app)/sales/desk/page.jsx'), /useDraftReminder\(\)/);
});

test('publishing or archiving a note refreshes the reminder straight away', () => {
  const notes = read('src/app/(app)/crm/notes/NotesClient.jsx');
  assert.match(notes, /onUpdate\(updated\);\s*draftsChanged\(\);/);
  assert.match(notes, /onDelete\(note\.id\);\s*draftsChanged\(\);/);
  assert.match(notes, /\['mine', 'Mine to publish'\]/);
  assert.match(read('src/components/layout/Sidebar.jsx'), /label="Sales Notes"[^>]*badge=\{waitingDrafts\}/);
});
