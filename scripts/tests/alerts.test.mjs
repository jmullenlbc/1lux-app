/**
 * Tests for the one door everything goes through to tell a human something.
 *
 * Runs under plain `node --test`, which is why `alerts.js` resolves the Prisma
 * client on first use instead of importing it at load: `@/lib/db` is a bundler
 * alias and nothing here could import the module otherwise. Every test below
 * passes its own `{ db }`, so no database is touched and `@/lib/db` is never
 * reached.
 *
 * What these pin, in order of how badly they fail silently:
 *
 *   1. `UserAlert.dedupeKey` is unique across the WHOLE table, not per user.
 *      Store a caller's key unnamespaced and the first recipient gets told
 *      while everyone else is dropped — with no error anywhere. This is the
 *      one bug in this file that would look like the feature working.
 *   2. A duplicate is the mechanism working, not a fault. If `notifyUser`
 *      reported P2002 as an error, a daily sweep would look broken every day
 *      after the first.
 *   3. Alerting must never fail the thing that triggered it. A budget save
 *      that dies because the bell was unreachable is a worse outcome than a
 *      missed bell.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scopedKey, notifyUser, notifyUsers, notifyProjectOwners,
} from '../../src/lib/alerts.js';

/**
 * A Prisma stand-in that enforces the one constraint that matters here: a
 * single unique index over dedupeKey for the entire table, exactly as the
 * schema declares it. Anything that relies on per-user uniqueness fails here
 * the same way it would in production.
 */
function fakeDb({ projects = {}, failWith = null } = {}) {
  const rows = [];
  const keys = new Set();
  return {
    rows,
    userAlert: {
      create: async ({ data }) => {
        if (failWith) throw failWith;
        if (data.dedupeKey != null) {
          if (keys.has(data.dedupeKey)) {
            const err = new Error('Unique constraint failed on the fields: (`dedupeKey`)');
            err.code = 'P2002';
            throw err;
          }
          keys.add(data.dedupeKey);
        }
        const row = { id: `alert${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
    },
    project: {
      findUnique: async ({ where }) => projects[where.id] ?? null,
    },
  };
}

const NOTE = { type: 'NOTE_REMINDER', title: 'Reminder: Lowell', message: 'call them back' };

// ── The dedupe trap ─────────────────────────────────────────────────────────

test('a key is namespaced to its recipient before it is stored', () => {
  assert.equal(scopedKey('u1', 'noteAction:42:reminder'), 'u1::noteAction:42:reminder');
  assert.notEqual(scopedKey('u1', 'e'), scopedKey('u2', 'e'),
    'two people must not collide on one event key — the index is table-wide');
});

test('no key means no dedupe, not a key of ""', () => {
  // An empty-string key would be a shared key: the first alert in the whole
  // table with no dedupe would then block every later one.
  assert.equal(scopedKey('u1', null), null);
  assert.equal(scopedKey('u1', ''), null);
  assert.equal(scopedKey('u1', undefined), null);
});

test('two people are both told about the same event', async () => {
  // The regression: with an unnamespaced key this returns sent:1, skipped:1,
  // throws nothing, logs nothing, and looks exactly like success.
  const db = fakeDb();
  const res = await notifyUsers(['u1', 'u2'], { ...NOTE, dedupeKey: 'budget:7:sent' }, { db });
  assert.equal(res.sent, 2, 'both owners must hear about it');
  assert.equal(res.skipped, 0);
  assert.equal(db.rows.length, 2);
  assert.equal(db.rows[0].dedupeKey, 'u1::budget:7:sent');
  assert.equal(db.rows[1].dedupeKey, 'u2::budget:7:sent');
});

test('the same person is told once, however many times the sweep runs', async () => {
  // This is what lets the daily reminder job run every day without nagging.
  const db = fakeDb();
  const first  = await notifyUser({ userId: 'u1', ...NOTE, dedupeKey: 'noteAction:42' }, { db });
  const second = await notifyUser({ userId: 'u1', ...NOTE, dedupeKey: 'noteAction:42' }, { db });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.reason, 'duplicate', 'already told is not an error');
  assert.equal(db.rows.length, 1);
});

test('without a key, repeats are allowed through', async () => {
  const db = fakeDb();
  await notifyUser({ userId: 'u1', ...NOTE }, { db });
  await notifyUser({ userId: 'u1', ...NOTE }, { db });
  assert.equal(db.rows.length, 2, 'a caller that opted out of dedupe must not get it anyway');
});

// ── Failure must stay contained ─────────────────────────────────────────────

test('a database failure is reported, never thrown', async () => {
  // Alerting is a side effect of a budget save, a note publish, a cron sweep.
  // If this rejects, it takes the real work down with it.
  const db = fakeDb({ failWith: new Error('connection terminated unexpectedly') });
  const res = await notifyUser({ userId: 'u1', ...NOTE }, { db });
  assert.equal(res.created, false);
  assert.equal(res.reason, 'error');
});

test('one recipient failing does not stop the others', async () => {
  // Deliveries run independently rather than in a transaction, so a user row
  // that has since been deleted cannot silence everyone else on the project.
  const base = fakeDb();
  const db = {
    ...base,
    userAlert: {
      create: async (args) => {
        if (args.data.userId === 'u1') throw new Error('foreign key violation');
        return base.userAlert.create(args);
      },
    },
  };
  const res = await notifyUsers(['u1', 'u2'], NOTE, { db });
  assert.equal(res.sent, 1);
  assert.equal(res.skipped, 1);
  assert.equal(base.rows[0].userId, 'u2');
});

test('an alert with nobody to send to, or nothing to say, is refused quietly', async () => {
  const db = fakeDb();
  assert.equal((await notifyUser({ userId: null, title: 'x' }, { db })).created, false);
  assert.equal((await notifyUser({ userId: 'u1', title: '' }, { db })).created, false);
  assert.equal(db.rows.length, 0, 'a blank alert must never reach the bell');
});

// ── Project owners ──────────────────────────────────────────────────────────

test('both owners of a project are told, and each only once', async () => {
  const db = fakeDb({ projects: { p1: { salesOwnerId: 'u1', preconManagerId: 'u2' } } });
  const res = await notifyProjectOwners('p1', { ...NOTE, dedupeKey: 'budget:7' }, { db });
  assert.equal(res.sent, 2);
  assert.deepEqual(db.rows.map(r => r.userId), ['u1', 'u2']);
});

test('one person wearing both hats is told once, not twice', async () => {
  const db = fakeDb({ projects: { p1: { salesOwnerId: 'u1', preconManagerId: 'u1' } } });
  const res = await notifyProjectOwners('p1', NOTE, { db });
  assert.equal(res.sent, 1, 'de-duped by person, not left to the unique index');
  assert.equal(db.rows.length, 1);
});

test('an unowned or unknown project tells nobody, and says nobody', async () => {
  // The caller has to be able to tell "delivered to nobody" from "delivered".
  // Silent evaporation here is how an alert goes missing with no trace.
  const db = fakeDb({ projects: { p1: { salesOwnerId: null, preconManagerId: null } } });
  assert.deepEqual(await notifyProjectOwners('p1', NOTE, { db }), { sent: 0, skipped: 0 });
  assert.deepEqual(await notifyProjectOwners('nope', NOTE, { db }), { sent: 0, skipped: 0 });
  assert.deepEqual(await notifyProjectOwners(null, NOTE, { db }), { sent: 0, skipped: 0 });
  assert.equal(db.rows.length, 0);
});

test('a project lookup that fails does not throw either', async () => {
  const db = {
    project:   { findUnique: async () => { throw new Error('no such table: Project'); } },
    userAlert: { create: async () => { throw new Error('should never be reached'); } },
  };
  assert.deepEqual(await notifyProjectOwners('p1', NOTE, { db }), { sent: 0, skipped: 0 });
});

// ── What actually lands in the row ──────────────────────────────────────────

test('an alert carries a type and a link even when the caller is careless', async () => {
  // The bell renders these. A null message or a missing type would render as
  // a broken row rather than a missing one, which is harder to notice.
  const db = fakeDb();
  await notifyUser({ userId: 'u1', title: 'Reminder' }, { db });
  assert.equal(db.rows[0].type, 'GENERAL');
  assert.equal(db.rows[0].message, '');
  assert.equal(db.rows[0].link, null);
  assert.equal(db.rows[0].dedupeKey, null);
});
