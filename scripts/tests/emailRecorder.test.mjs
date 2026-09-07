/**
 * Turning a Microsoft message into something we can file against a person.
 *
 * The pure halves only — reading a provider message, and working out which of
 * our people were on it and in what capacity. The database half is exercised by
 * the app itself; these are the rules that must not drift.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fromGraphMessage, fromStoredMessage, parseAddressList, toAddressJson,
} from '../../src/lib/email/normalize.js';
import { contactRolesForMessage, addressesOnMessage } from '../../src/lib/email/recorder.js';
import { classifyEmail } from '../../src/lib/email/classify.js';

const graphMessage = {
  id: 'AAMkAD123',
  conversationId: 'conv-1',
  subject: 'Trailhead budget',
  bodyPreview: 'Here is the number you asked for',
  from: { emailAddress: { address: 'Sam@Developer.com', name: 'Sam Jones' } },
  toRecipients: [{ emailAddress: { address: 'mike@ilcstudios.com', name: 'Mike' } }],
  ccRecipients: [{ emailAddress: { address: 'dana@developer.com' } }],
  sentDateTime: '2026-09-04T14:02:00Z',
  receivedDateTime: '2026-09-04T14:02:10Z',
  hasAttachments: true,
  internetMessageId: '<abc@developer.com>',
  internetMessageHeaders: [{ name: 'In-Reply-To', value: '<prev@ilcstudios.com>' }],
};

// ── Reading a Microsoft message ──────────────────────────────────────────────

test('a Microsoft message is read into the neutral shape', () => {
  const m = fromGraphMessage(graphMessage, 'mike@ilcstudios.com');
  assert.equal(m.externalId, 'AAMkAD123');
  assert.equal(m.subject, 'Trailhead budget');
  assert.equal(m.from, 'Sam@Developer.com');
  assert.deepEqual(m.to, ['mike@ilcstudios.com']);
  assert.deepEqual(m.cc, ['dana@developer.com']);
  assert.equal(m.hasAttachments, true);
  assert.equal(m.inReplyTo, '<prev@ilcstudios.com>');
});

test('direction comes from whether our own mailbox sent it', () => {
  assert.equal(fromGraphMessage(graphMessage, 'mike@ilcstudios.com').direction, 'INBOUND');
  const ours = { ...graphMessage, from: { emailAddress: { address: 'mike@ilcstudios.com' } } };
  assert.equal(fromGraphMessage(ours, 'MIKE@ilcstudios.com').direction, 'OUTBOUND');
});

test('a Microsoft meeting request is flagged as a calendar invite', () => {
  const invite = { ...graphMessage, '@odata.type': '#microsoft.graph.eventMessageRequest' };
  assert.equal(fromGraphMessage(invite).isCalendarInvite, true);
  assert.equal(fromGraphMessage(graphMessage).isCalendarInvite, false);
});

test('headers arrive as a list and are read as a map', () => {
  const m = fromGraphMessage({
    ...graphMessage,
    internetMessageHeaders: [{ name: 'Auto-Submitted', value: 'auto-replied' }],
  });
  assert.equal(m.headers['auto-submitted'], 'auto-replied');
  assert.equal(m.inReplyTo, null);
});

test('a message with nothing in it does not throw', () => {
  const m = fromGraphMessage({});
  assert.equal(m.externalId, null);
  assert.deepEqual(m.to, []);
  assert.equal(m.subject, '');
});

// ── Reading a message back out of our own database ───────────────────────────

test('the stored address columns are read back into plain addresses', () => {
  assert.deepEqual(parseAddressList('[{"email":"sam@dev.com","name":"Sam"}]'), ['sam@dev.com']);
  assert.deepEqual(parseAddressList(null), []);
  assert.deepEqual(parseAddressList('not json'), []);
  assert.deepEqual(parseAddressList(['a@b.com']), ['a@b.com']);
});

test('a saved row can be run back through the rules without asking Microsoft again', () => {
  const row = {
    externalId: 'AAMkAD123',
    subject: 'RE: Trailhead budget',
    fromEmail: 'sam@dev.com',
    toEmails: '[{"email":"mike@ilcstudios.com"}]',
    ccEmails: null,
    sentAt: new Date('2026-09-04T14:02:00Z'),
  };
  const m = fromStoredMessage(row);
  assert.equal(m.from, 'sam@dev.com');
  assert.deepEqual(m.cc, []);
  assert.equal(classifyEmail(m).reply, true);
});

test('addresses round-trip through the stored JSON shape', () => {
  assert.deepEqual(parseAddressList(toAddressJson(['a@b.com', 'c@d.com'])), ['a@b.com', 'c@d.com']);
  assert.deepEqual(parseAddressList(toAddressJson([])), []);
});

// ── Matching our people to the email ─────────────────────────────────────────

test('every address on the email is gathered once, lowercased', () => {
  const m = fromGraphMessage(graphMessage);
  assert.deepEqual(addressesOnMessage(m), ['sam@developer.com', 'mike@ilcstudios.com', 'dana@developer.com']);
});

test('the sender is filed as FROM and the recipients as TO or CC', () => {
  const roles = contactRolesForMessage(fromGraphMessage(graphMessage), {
    'sam@developer.com':  'contact-sam',
    'dana@developer.com': 'contact-dana',
  });
  assert.deepEqual(roles, [
    { contactId: 'contact-sam',  role: 'FROM' },
    { contactId: 'contact-dana', role: 'CC' },
  ]);
});

test('people we do not know are simply not linked', () => {
  const roles = contactRolesForMessage(fromGraphMessage(graphMessage), {});
  assert.deepEqual(roles, []);
});

test('a person on the email twice gets one row, with the stronger role', () => {
  const message = { from: 'sam@dev.com', to: ['sam@dev.com'], cc: ['SAM@dev.com'] };
  const roles = contactRolesForMessage(message, { 'sam@dev.com': 'contact-sam' });
  assert.equal(roles.length, 1);
  assert.equal(roles[0].role, 'FROM');       // sending beats being copied
});

test('a recipient is filed as TO, which is what makes it an email we sent', () => {
  const message = { from: 'mike@ilcstudios.com', to: ['sam@dev.com'] };
  const roles = contactRolesForMessage(message, { 'sam@dev.com': 'contact-sam' });
  assert.deepEqual(roles, [{ contactId: 'contact-sam', role: 'TO' }]);
});

test('a mass send still links the people on it — it just does not count', () => {
  const to = Array.from({ length: 40 }, (_, i) => `p${i}@dev.com`);
  const message = { from: 'mike@ilcstudios.com', to, subject: 'Holiday party' };
  assert.equal(classifyEmail(message).counts, false);
  // The link is still made, so we can tell someone "only on mass sends".
  assert.deepEqual(contactRolesForMessage(message, { 'p3@dev.com': 'contact-p3' }),
    [{ contactId: 'contact-p3', role: 'TO' }]);
});
