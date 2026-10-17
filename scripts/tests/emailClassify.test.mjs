/**
 * The email rules that decide what counts as real contact with a person.
 *
 * Mike, 2026-09-06: "mass emails should be emails with 25 or more people on
 * them." His People spec: the two Last Email fields "must be able to filter out
 * mass emails and calendar invites and replies."
 *
 * These run against pure functions, no database, no network, no Microsoft.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MASS_EMAIL_MIN_PEOPLE, normalizeAddress, recipientCount, isMassEmail,
  baseSubject, hasReplyPrefix, isReply, isCalendarInvite, isAutomated,
  classifyEmail, skipReasonLabel, normalizeMinPeople,
} from '../../src/lib/email/classify.js';

const people = n => Array.from({ length: n }, (_, i) => `person${i}@dev.com`);

// ── Addresses ────────────────────────────────────────────────────────────────

test('an address is read the same however it was written', () => {
  assert.equal(normalizeAddress('Mike Kershner <Mike@ILCStudios.com>'), 'mike@ilcstudios.com');
  assert.equal(normalizeAddress('  MIKE@ilcstudios.com '), 'mike@ilcstudios.com');
  assert.equal(normalizeAddress(''), '');
  assert.equal(normalizeAddress(null), '');
});

test('the same person on To and Cc is counted once', () => {
  const msg = {
    from: 'mike@ilcstudios.com',
    to: ['sam@dev.com', 'SAM@dev.com'],
    cc: ['Sam Jones <sam@dev.com>'],
  };
  assert.equal(recipientCount(msg), 2);   // Mike and Sam
});

test('the sender counts as one of the people on the email', () => {
  assert.equal(recipientCount({ from: 'mike@ilcstudios.com', to: ['sam@dev.com'] }), 2);
  assert.equal(recipientCount({}), 0);
});

// ── Mass email: 25 or more people ────────────────────────────────────────────

test('25 or more people on it is a mass email, 24 is not', () => {
  assert.equal(MASS_EMAIL_MIN_PEOPLE, 25);
  // 24 recipients + the sender = 25 people. Mass.
  assert.equal(isMassEmail({ from: 'mike@ilcstudios.com', to: people(24) }), true);
  // 23 recipients + the sender = 24 people. Not mass.
  assert.equal(isMassEmail({ from: 'mike@ilcstudios.com', to: people(23) }), false);
});

test('a mass email counts its Bcc and Cc lists too', () => {
  const msg = { from: 'mike@ilcstudios.com', to: people(10), cc: people(10).map(a => `c-${a}`), bcc: people(10).map(a => `b-${a}`) };
  assert.equal(recipientCount(msg), 31);
  assert.equal(isMassEmail(msg), true);
});

test('a normal one-to-one email is never mass', () => {
  assert.equal(isMassEmail({ from: 'mike@ilcstudios.com', to: ['sam@dev.com'] }), false);
});

// ── Replies ──────────────────────────────────────────────────────────────────

test('a stacked Outlook subject is peeled back to the real subject', () => {
  assert.equal(baseSubject('RE: FW: RE: Trailhead budget'), 'Trailhead budget');
  assert.equal(baseSubject('Re[2]: Trailhead budget'), 'Trailhead budget');
  assert.equal(baseSubject('Trailhead budget'), 'Trailhead budget');
  assert.equal(baseSubject(''), '');
});

test('a reply prefix is spotted in any of the usual spellings', () => {
  assert.equal(hasReplyPrefix('RE: budget'), true);
  assert.equal(hasReplyPrefix('re:budget'), true);
  assert.equal(hasReplyPrefix('Fwd: budget'), true);
  assert.equal(hasReplyPrefix('AW: budget'), true);            // German Outlook
  assert.equal(hasReplyPrefix('Budget: what we discussed'), false);
});

test('a reply is caught by the header even when the subject was rewritten', () => {
  assert.equal(isReply({ subject: 'Trailhead budget', inReplyTo: '<abc@dev.com>' }), true);
  assert.equal(isReply({ subject: 'Trailhead budget', headers: { 'in-reply-to': '<abc@dev.com>' } }), true);
  assert.equal(isReply({ subject: 'Trailhead budget', headers: { references: '<abc@dev.com>' } }), true);
});

test('a long Microsoft conversation index means the message is down a thread', () => {
  const first = 'A'.repeat(32);        // 22 bytes base64, the first message
  const later = 'A'.repeat(44);        // grown by a reply
  assert.equal(isReply({ subject: 'Trailhead budget', conversationIndex: first }), false);
  assert.equal(isReply({ subject: 'Trailhead budget', conversationIndex: later }), true);
});

test('a fresh email is not a reply', () => {
  assert.equal(isReply({ subject: 'Trailhead budget' }), false);
  assert.equal(isReply(null), false);
});

// ── Calendar invites ─────────────────────────────────────────────────────────

test('a calendar invite is caught however the mail system flags it', () => {
  assert.equal(isCalendarInvite({ isCalendarInvite: true }), true);
  assert.equal(isCalendarInvite({ messageClass: 'IPM.Schedule.Meeting.Request' }), true);
  assert.equal(isCalendarInvite({ headers: { 'content-type': 'text/calendar; method=REQUEST' } }), true);
  assert.equal(isCalendarInvite({ subject: 'Invitation: Trailhead kickoff' }), true);
  assert.equal(isCalendarInvite({ subject: 'Canceled: Trailhead kickoff' }), true);
});

test('an ordinary email about a meeting is not a calendar invite', () => {
  assert.equal(isCalendarInvite({ subject: 'Can we meet Thursday about Trailhead?' }), false);
  assert.equal(isCalendarInvite(null), false);
});

// ── Automatic messages ───────────────────────────────────────────────────────

test('out-of-office replies, bounces and no-reply addresses are automatic', () => {
  assert.equal(isAutomated({ subject: 'Automatic reply: Out of Office' }), true);
  assert.equal(isAutomated({ subject: 'Out of Office' }), true);
  assert.equal(isAutomated({ subject: 'Undeliverable: Trailhead budget' }), true);
  assert.equal(isAutomated({ from: 'no-reply@constantcontact.com', subject: 'Newsletter' }), true);
  assert.equal(isAutomated({ subject: 'Newsletter', headers: { 'list-unsubscribe': '<x>' } }), true);
  assert.equal(isAutomated({ subject: 'Trailhead budget', headers: { 'auto-submitted': 'auto-replied' } }), true);
});

test('a real person writing a real email is not automatic', () => {
  assert.equal(isAutomated({ from: 'sam@dev.com', subject: 'Trailhead budget' }), false);
  assert.equal(isAutomated({ from: 'sam@dev.com', subject: 'Trailhead budget', headers: { 'auto-submitted': 'no' } }), false);
});

// ── The whole decision ───────────────────────────────────────────────────────

test('a real one-to-one email counts', () => {
  const result = classifyEmail({
    from: 'mike@ilcstudios.com',
    to: ['sam@dev.com'],
    subject: 'Trailhead budget',
  });
  assert.equal(result.counts, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.people, 2);
});

test('a small group email still counts, only 25 or more is too many', () => {
  const result = classifyEmail({ from: 'mike@ilcstudios.com', to: people(5), subject: 'Trailhead budget' });
  assert.equal(result.counts, true);
  assert.equal(result.people, 6);
});

test('each of the three filters on its own stops an email counting', () => {
  assert.equal(classifyEmail({ from: 'mike@ilcstudios.com', to: people(30), subject: 'Newsletter' }).massEmail, true);
  assert.equal(classifyEmail({ from: 'mike@ilcstudios.com', to: ['sam@dev.com'], subject: 'RE: Trailhead' }).reply, true);
  assert.equal(classifyEmail({ from: 'mike@ilcstudios.com', to: ['sam@dev.com'], isCalendarInvite: true }).calendarInvite, true);

  for (const msg of [
    { from: 'mike@ilcstudios.com', to: people(30), subject: 'Newsletter' },
    { from: 'mike@ilcstudios.com', to: ['sam@dev.com'], subject: 'RE: Trailhead' },
    { from: 'mike@ilcstudios.com', to: ['sam@dev.com'], isCalendarInvite: true },
  ]) {
    assert.equal(classifyEmail(msg).counts, false);
  }
});

test('an email can fail more than one rule and every reason is kept', () => {
  const result = classifyEmail({
    from: 'no-reply@marketing.com',
    to: people(40),
    subject: 'RE: Our monthly update',
  });
  assert.equal(result.counts, false);
  assert.deepEqual(result.reasons, ['mass email', 'reply', 'automated']);
});

test('the reasons read as plain English on the screen', () => {
  assert.equal(skipReasonLabel(['mass email']), 'sent to 25 or more people');
  assert.equal(skipReasonLabel(['calendar invite', 'reply']), 'a calendar invite, a reply, not a fresh email');
  assert.equal(skipReasonLabel([]), '');
});

// ── The 25 is changeable ─────────────────────────────────────────────────────
// Mike, 2026-09-07: "make it changeable but set to 25. no one will probably
// change it." The number can come from a MIN_RECIPIENTS rule on the Sales
// Automation → Rules screen; these check the rules honour it.

test('25 is what applies when nobody has changed it', () => {
  assert.equal(MASS_EMAIL_MIN_PEOPLE, 25);
  assert.equal(isMassEmail({ from: 'mike@ilcstudios.com', to: people(24) }), true);   // 24 + Mike = 25
  assert.equal(isMassEmail({ from: 'mike@ilcstudios.com', to: people(23) }), false);  // 23 + Mike = 24
});

test('a different number set on the rules screen is obeyed', () => {
  const msg = { from: 'mike@ilcstudios.com', to: people(9) };   // 10 people
  assert.equal(isMassEmail(msg, 10), true);
  assert.equal(isMassEmail(msg, 11), false);
  assert.equal(classifyEmail(msg, { massEmailMinPeople: 10 }).counts, false);
  assert.equal(classifyEmail(msg, { massEmailMinPeople: 50 }).counts, true);
});

test('the number in force is reported back with the verdict', () => {
  assert.equal(classifyEmail({ from: 'a@b.com', to: ['c@d.com'] }).minPeople, 25);
  assert.equal(classifyEmail({ from: 'a@b.com', to: ['c@d.com'] }, { massEmailMinPeople: 8 }).minPeople, 8);
});

test('a junk number falls back to 25 rather than breaking the sync', () => {
  const msg = { from: 'mike@ilcstudios.com', to: people(24) };  // 25 people
  for (const junk of [null, undefined, 0, 1, -5, 'abc', NaN, '']) {
    assert.equal(isMassEmail(msg, junk), true, `expected 25 to apply for ${String(junk)}`);
  }
  assert.equal(normalizeMinPeople('30'), 30);       // a number typed as text still works
  assert.equal(normalizeMinPeople(30.7), 30);       // and a fraction is floored
});

test('the plain-English reason uses the number actually in force', () => {
  assert.equal(skipReasonLabel(['mass email'], 10), 'sent to 10 or more people');
  assert.equal(skipReasonLabel(['mass email'], 'junk'), 'sent to 25 or more people');
});
