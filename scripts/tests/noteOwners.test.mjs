// Shared notes (0108): leads, recipients, sender, step fixes, sender swap.
import assert from 'node:assert/strict';
import { leadFromText, stepRecipients, stepIsMine, senderFor, ownerIdsOf } from '../../src/lib/notes/owners.js';
import { fixStepType, dueFromText, cleanDue, remindMeAt } from '../../src/lib/notes/stepFixes.js';
import { swapSender } from '../../src/lib/bot/emailStyle.js';

const owners = [{ id: 'a', name: 'Mike Kershner' }, { id: 'b', name: 'Sam Lee' }];

// Lead from the line's first words
assert.equal(leadFromText('Mike to call Jane', owners), 'a');
assert.equal(leadFromText('Sam: send the specs', owners), 'b');
assert.equal(leadFromText("Sam's on the pricing", owners), 'b');
assert.equal(leadFromText('Call Mike about specs', owners), null);
assert.equal(leadFromText('Mike to call Jane', owners.slice(0, 1)), null, 'one owner: no lead needed');
assert.equal(leadFromText('Mikeal to call', owners), null);

// Recipients: lead only, else every owner
assert.deepEqual(stepRecipients({ leadUserId: 'b' }, ['a', 'b']), ['b']);
assert.deepEqual(stepRecipients({ leadUserId: null }, ['a', 'b']), ['a', 'b']);
assert.deepEqual(stepRecipients({ leadUserId: 'z' }, ['a', 'b']), ['a', 'b'], 'lead taken off the note');
assert.equal(stepIsMine({ leadUserId: 'b' }, ['a', 'b'], 'a'), false);
assert.deepEqual(ownerIdsOf({ createdById: 'b', owners: [{ userId: 'a' }, { userId: 'b' }] }), ['b', 'a']);
assert.deepEqual(ownerIdsOf({ createdById: 'c', owners: [] }), ['c']);

// Sender
assert.deepEqual(senderFor([{ leadUserId: 'b' }, { leadUserId: 'b' }], ['a', 'b'], 'a'), { userId: 'b', pending: false });
assert.deepEqual(senderFor([{ leadUserId: 'b' }, { leadUserId: null }], ['a', 'b'], 'a'), { userId: 'a', pending: true });
assert.deepEqual(senderFor([{ leadUserId: null }], ['a'], 'a'), { userId: 'a', pending: false });

// Step fixes
const valid = new Set(['EMAIL', 'SEND_MATERIALS', 'REMIND_ME', 'OTHER']);
assert.equal(fixStepType('SEND_MATERIALS', 'Email Jane the specs', valid), 'EMAIL');
assert.equal(fixStepType('SEND_MATERIALS', 'Mike to email Jane the specs', valid, ['Mike Kershner']), 'EMAIL');
assert.equal(fixStepType('OTHER', 'Remind me to check in with Sam', valid), 'REMIND_ME');
assert.equal(fixStepType('SEND_MATERIALS', 'Send Jane the cut sheets', valid), 'SEND_MATERIALS');
const mtg = new Date('2026-09-27T15:00:00Z'); // a Sunday
assert.equal(dueFromText('send pricing by Friday', mtg).toISOString().slice(0, 10), '2026-10-02');
assert.equal(dueFromText('call in 2 weeks', mtg).toISOString().slice(0, 10), '2026-10-11');
assert.equal(dueFromText('tomorrow', mtg).toISOString().slice(0, 10), '2026-09-28');
assert.equal(dueFromText('call Jane', mtg), null);
assert.equal(cleanDue('2026-02-30', mtg), null);
assert.equal(cleanDue('2030-01-01', mtg), null);
assert.equal(remindMeAt(null, mtg, mtg).toISOString().slice(0, 10), '2026-10-04');

// Sender swap: old sign-off name and signature off, new ones on
const mike = { name: 'Mike', signatureName: 'Michael Kershner', email: 'mike@x.com' };
const sam = { name: 'Sam Lee', email: 'sam@x.com' };
const body = 'Hi Jane,\n\nGreat meeting.\n\nBest,\nMichael\n\nMichael Kershner\nmike@x.com';
const out = swapSender(body, mike, sam);
assert.ok(out.endsWith('Best,\nSam\n\nSam Lee\nsam@x.com'), out);
assert.ok(!out.includes('mike@x.com'));

console.log('noteOwners: all passed');
