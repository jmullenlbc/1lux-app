/**
 * Introductions: someone we do not know, on an email or an invite with someone
 * we do, at a company we work with. The detector is pure; the recorder is run
 * against a fake database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectIntroductions, recordIntroductions, recordIntroductionsForAddresses } from '../../src/lib/sync/introductions.js';
import { buildClientDomainMap, guessClientIdForEmail } from '../../src/lib/crm/clientDomains.js';
import { quickContact } from '../../src/lib/crm/quickContact.js';

const knownByEmail = new Map([
  ['sam@clearskydev.com', { contactId: 'sam', clientId: 'clearsky' }],
  ['lee@northwind.test',  { contactId: 'lee', clientId: 'northwind' }],
]);
const clientDomains = new Map([['clearskydev.com', 'clearsky'], ['northwind.test', 'northwind']]);

test('an unknown person at a known company, with a known contact on the email, is an introduction', () => {
  const got = detectIntroductions({
    addresses: [
      { email: 'Sam@ClearskyDev.com', name: 'Sam Jones' },
      { email: 'mike@ilcstudios.com', name: 'Mike' },
      { email: 'dana@clearskydev.com', name: 'Dana Ortiz' },
    ],
    knownByEmail, clientDomains,
  });
  assert.deepEqual(got, [{ introducedEmail: 'dana@clearskydev.com', introducedName: 'Dana Ortiz', clientId: 'clearsky', introducedByContactId: 'sam' }]);
});

test('no known contact on it means no introduction, even at a known company', () => {
  const got = detectIntroductions({ addresses: [{ email: 'dana@clearskydev.com' }, { email: 'mike@ilcstudios.com' }], knownByEmail, clientDomains });
  assert.deepEqual(got, []);
});

test('free mail and our own staff are never introductions', () => {
  const got = detectIntroductions({
    addresses: [{ email: 'sam@clearskydev.com' }, { email: 'cousin@gmail.com' }, { email: 'sean@ilcstudios.com' }],
    knownByEmail, clientDomains: new Map([...clientDomains, ['gmail.com', 'oops']]),
  });
  assert.deepEqual(got, []);
});

test('an unknown domain is not an introduction, and the introducer is the known person at that company', () => {
  const got = detectIntroductions({
    addresses: [{ email: 'lee@northwind.test' }, { email: 'sam@clearskydev.com' }, { email: 'new@northwind.test' }, { email: 'who@stranger.test' }],
    knownByEmail, clientDomains,
  });
  assert.equal(got.length, 1);
  assert.equal(got[0].introducedEmail, 'new@northwind.test');
  assert.equal(got[0].introducedByContactId, 'lee');
});

test('the same address twice is one candidate', () => {
  const got = detectIntroductions({
    addresses: [{ email: 'sam@clearskydev.com' }, { email: 'dana@clearskydev.com' }, { email: 'DANA@clearskydev.com' }],
    knownByEmail, clientDomains,
  });
  assert.equal(got.length, 1);
});

test('the company domain map reads emailDomains, then the website, then the people, and skips free mail', () => {
  const map = buildClientDomainMap(
    [{ id: 'a', emailDomains: '["acme.com"]', website: 'https://www.acme-homes.com/about' }, { id: 'b', emailDomains: [], website: null }],
    [{ email: 'x@bco.test', clientId: 'b' }, { email: 'y@gmail.com', clientId: 'b' }, { email: 'z@acme.com', clientId: 'b' }],
  );
  assert.equal(map.get('acme.com'), 'a');          // explicit wins over a person filed under b
  assert.equal(map.get('acme-homes.com'), 'a');
  assert.equal(map.get('bco.test'), 'b');
  assert.equal(map.has('gmail.com'), false);
  assert.equal(guessClientIdForEmail('New@BCO.test', map), 'b');
  assert.equal(guessClientIdForEmail('nobody@else.test', map), null);
});

// The recorder, against a fake database.

function fakeDb() {
  const db = {
    rows: [],
    contacts: [
      { id: 'sam', name: 'Sam Jones', email: 'sam@clearskydev.com', clientId: 'clearsky', contactNumber: 1 },
    ],
    clients: [{ id: 'clearsky', name: 'Clearsky Development', emailDomains: '[]', website: 'clearskydev.com' }],
    introduction: {
      findFirst: async ({ where }) => db.rows.find(r => r.introducedEmail === where.introducedEmail
        && (where.sourceMessageId ? r.sourceMessageId === where.sourceMessageId : r.sourceCalendarRef === where.sourceCalendarRef)) || null,
      create: async ({ data }) => { const row = { id: `i${db.rows.length + 1}`, status: 'NEW', ...data }; db.rows.push(row); return row; },
      update: async ({ where, data }) => Object.assign(db.rows.find(r => r.id === where.id), data),
    },
    contact: {
      findMany:  async ({ where } = {}) => db.contacts.filter(c => c.email && (!where?.clientId || c.clientId)),
      findUnique: async ({ where }) => db.contacts.find(c => c.id === where.id) || null,
      aggregate: async () => ({ _max: { contactNumber: Math.max(0, ...db.contacts.map(c => c.contactNumber || 0)) } }),
      create:    async ({ data }) => { const c = { id: `c${db.contacts.length + 1}`, ...data }; db.contacts.push(c); return c; },
      update:    async ({ where, data }) => Object.assign(db.contacts.find(c => c.id === where.id), data),
    },
    client: {
      findMany:   async () => db.clients,
      findUnique: async ({ where }) => db.clients.find(c => c.id === where.id) || null,
    },
  };
  return db;
}

test('recording an email makes one row per new person and a re-sync updates it', async () => {
  const db = fakeDb();
  const addresses = [{ email: 'sam@clearskydev.com', name: 'Sam Jones' }, { email: 'dana@clearskydev.com', name: 'Dana' }, { email: 'mike@ilcstudios.com' }];
  const first = await recordIntroductionsForAddresses(db, addresses, { kind: 'email', sourceMessageId: 'm1' });
  assert.deepEqual(first, ['i1']);
  assert.equal(db.rows[0].clientId, 'clearsky');
  assert.equal(db.rows[0].introducedByContactId, 'sam');
  assert.equal(db.rows[0].status, 'NEW');

  db.rows[0].status = 'DISMISSED';
  const again = await recordIntroductionsForAddresses(db, [...addresses.slice(0, 2).map(a => ({ ...a, name: 'Dana Ortiz' })), addresses[2]], { kind: 'email', sourceMessageId: 'm1' });
  assert.deepEqual(again, ['i1']);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].status, 'DISMISSED');         // a decision is kept
  assert.equal(db.rows[0].introducedName, 'Dana Ortiz'); // the facts refresh
});

test('a calendar invite is keyed on its own id, and a failing database never throws', async () => {
  const db = fakeDb();
  const ids = await recordIntroductions(db, [{ introducedEmail: 'dana@clearskydev.com', clientId: 'clearsky', introducedByContactId: 'sam' }],
    { kind: 'calendar', sourceCalendarRef: 'ev-1' });
  assert.equal(ids.length, 1);
  assert.equal(db.rows[0].kind, 'calendar');
  assert.equal(db.rows[0].sourceCalendarRef, 'ev-1');

  const broken = { introduction: { findFirst: async () => { throw new Error('down'); } }, contact: db.contact, client: db.client };
  assert.deepEqual(await recordIntroductionsForAddresses(broken, [{ email: 'sam@clearskydev.com' }, { email: 'x@clearskydev.com' }], { sourceMessageId: 'm9' }), []);
});

test('quick add finds the person by email or makes them with the company guessed from the domain', async () => {
  const db = fakeDb();
  const same = await quickContact(db, { email: 'SAM@clearskydev.com' });
  assert.equal(same.created, false);
  assert.equal(same.contact.id, 'sam');

  const made = await quickContact(db, { email: 'dana.ortiz@clearskydev.com' });
  assert.equal(made.created, true);
  assert.equal(made.clientGuessed, true);
  assert.equal(made.contact.clientId, 'clearsky');
  const row = db.contacts.find(c => c.id === made.contact.id);
  assert.equal(row.name, 'Dana Ortiz');
  assert.equal(row.firstName, 'Dana');
  assert.equal(row.contactNumber, 2);
  assert.equal(row.company, 'Clearsky Development');

  await assert.rejects(() => quickContact(db, { email: 'not an email' }));
});
