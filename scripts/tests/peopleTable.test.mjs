/**
 * One people table.
 *
 * There used to be two Prisma models describing the same humans, ClientContact
 * (people at a client) and Contact (people we know, company optional). The same
 * person's last email lived on one row and their last coffee on the other, so
 * no screen could ever show both at once.
 *
 * These tests read schema.prisma and src/ as TEXT on purpose, no database, no
 * Prisma client, nothing that needs a server running. They exist to fail loudly
 * the day somebody adds a second people table back, or half-renames the model.
 *
 * Run: node --test scripts/tests/peopleTable.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'prisma', 'migrations', '0070_merge_people_tables', 'migration.sql'), 'utf8');

/** The body of `model Name { … }`, or null. */
function model(name) {
  const start = SCHEMA.indexOf(`\nmodel ${name} {`);
  if (start < 0) return null;
  const end = SCHEMA.indexOf('\n}', start);
  return SCHEMA.slice(start, end);
}

/**
 * A model's fields as name -> the rest of its line, so a test can ask "is this
 * field here, and what is its type" without writing a regex per field.
 */
function fields(name) {
  const out = new Map();
  for (const raw of (model(name) ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('@@') || line.endsWith('{')) continue;
    const parts = line.split(/\s+/);
    out.set(parts[0], parts.slice(1).join(' '));
  }
  return out;
}

/** Every .js/.jsx file under src/. */
function sourceFiles(dir = path.join(ROOT, 'src'), out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, out);
    else if (/\.jsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

test('there is exactly one model for a person', () => {
  assert.ok(model('Contact'), 'the Contact model must exist');
  assert.equal(model('ClientContact'), null,
    'ClientContact is gone as a MODEL: a second people model means one person can be two records again');
});

test('the table name is left alone, so no production table had to be renamed', () => {
  assert.ok(model('Contact').includes('@@map("ClientContact")'),
    'the model is Contact but the table is still ClientContact: dropping the @@map points Prisma at a table that does not exist');
});

test('one person carries both their email history and their in-person history', () => {
  const f = fields('Contact');
  // These two halves used to live on different rows. That was the whole bug.
  for (const name of ['lastEmailReceivedAt', 'lastEmailSentAt', 'lastInPersonAt', 'lastTouchpointAt']) {
    assert.ok(f.has(name), `${name} must be on the one person record`);
    assert.ok(f.get(name).startsWith('DateTime?'), `${name} must stay an optional date`);
  }
});

test('nothing either old table knew was left behind', () => {
  const f = fields('Contact');
  const fromClientContact = ['firstName', 'lastName', 'cellPhone', 'workPhone', 'department', 'linkedInUrl'];
  const fromContact       = ['contactNumber', 'preferredName', 'company', 'notes', 'cadenceTier', 'cadenceDays', 'nextCheckInAt'];
  for (const name of [...fromClientContact, ...fromContact]) {
    assert.ok(f.has(name), `${name} must survive the merge`);
  }
});

test('a person can exist before we know where they work', () => {
  const f = fields('Contact');
  assert.ok(f.get('clientId').startsWith('String?'),
    'clientId must be optional: we meet people before we know their company');
  const client = f.get('client');
  assert.ok(client.startsWith('Client?'), 'the company link must be optional');
  assert.ok(client.includes('onDelete: SetNull'),
    'deleting a company must unhook its people, never delete them');
});

test('the contact number is optional now, because most people never had one', () => {
  // Only the old CRM table ever issued numbers. Migration 0070 backfills the
  // rest, but the column has to allow a gap while that runs.
  const spec = fields('Contact').get('contactNumber');
  assert.ok(spec.startsWith('Int?'), 'contactNumber must allow a gap while the backfill runs');
  assert.ok(spec.includes('@unique'), 'two people must never share a number');
});

test('every link that pointed at a person still points at one', () => {
  for (const name of ['ProjectContact', 'NoteContact', 'EmailContactLink']) {
    assert.ok(fields(name).get('contact').startsWith('Contact '),
      `${name}.contact must resolve to the merged model`);
  }
});

test('a client has one list of people, not two', () => {
  const f = fields('Client');
  assert.ok(f.get('contacts').startsWith('Contact[]'));
  assert.ok(!f.has('crmContacts'),
    'the second list is what let the same person be filed twice');
});

test('both screens that create a person hand out a number from the same sequence', () => {
  // The CRM screen used to own numbering privately; the client People tab created
  // people with no number at all. Two screens, one counter.
  for (const rel of ['src/app/api/crm/contacts/route.js', 'src/app/api/clients/[id]/contacts/route.js']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(src.includes("from '@/lib/contactNumber'"), `${rel} must use the shared counter`);
    assert.ok(src.includes('nextContactNumber()'), `${rel} must actually call it`);
  }
});

test('no code still asks Prisma for the retired accessor', () => {
  // Renaming the model retires prisma.clientContact. A missed call site does not
  // fail the build, it throws at request time, in production.
  const offenders = sourceFiles()
    .filter(f => /prisma\.clientContact\b/.test(fs.readFileSync(f, 'utf8')))
    .map(f => path.relative(ROOT, f));
  assert.deepEqual(offenders, [], `these files call an accessor that no longer exists: ${offenders.join(', ')}`);
});

test('the old table is kept, not dropped', () => {
  assert.ok(MIGRATION.includes('ALTER TABLE "Contact" RENAME TO "ContactLegacy"'),
    'the merge must stay undoable by hand until it has run against real data');
  assert.doesNotMatch(MIGRATION, /DROP TABLE/i, 'nothing about a person may be dropped');
  assert.doesNotMatch(MIGRATION, /DROP COLUMN/i, 'no column may be dropped');
});

test('the merge only joins people it is sure about', () => {
  // A shared address (info@) matching several rows would hand one contact number
  // to two people and fail the unique index mid-deploy. Both sides must be proved
  // unique before anything is merged; anything ambiguous stays a visible duplicate.
  assert.equal((MIGRATION.match(/HAVING count\(\*\) = 1/g) || []).length, 2,
    'both the old and the new side must be checked for a duplicate email');
  // Note links must never be moved with a bare UPDATE, that trips the
  // (noteId, contactId) unique index the instant a survivor already has the link,
  // and Postgres aborts the whole migration mid-deploy.
  assert.doesNotMatch(MIGRATION, /UPDATE "NoteContact"/,
    'note links move by insert-then-delete, so the unique index can never be tripped');
  assert.ok(MIGRATION.includes('ON CONFLICT ("noteId", "contactId") DO NOTHING'));
});
