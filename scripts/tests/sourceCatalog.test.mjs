/**
 * Tests for the news source catalog.
 *
 * The catalog is a hand-edited list, so the failures worth pinning are the ones
 * a careless edit causes:
 *
 *   1. A duplicate name. `name` is unique in the database and is what the
 *      seeder matches on, so two entries sharing one means the second silently
 *      never lands and nobody is told.
 *   2. A market key that is not in MARKETS. A mis-tagged source disappears out
 *      of its group and reads as "we have no coverage there".
 *   3. A seeder that is not idempotent. It runs against a live list; adding a
 *      source twice, or re-adding one somebody deliberately removed, is worse
 *      than not running at all.
 *
 * These are all offline checks. Whether a feed still returns XML is a question
 * about the internet, not about this file, and belongs in the poll log.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKETS, SOURCES, DEFAULT_MARKET, RETIRED,
  marketLabel, isKnownMarket, missingSources, groupByMarket,
  isRetired, retiredStillActive,
} from '../../src/lib/market-intel/sourceCatalog.js';

// ── The list itself ─────────────────────────────────────────────────────────

test('every source has a name, a feed and a site', () => {
  for (const s of SOURCES) {
    assert.ok(s.name?.trim(),    `a source is missing a name: ${JSON.stringify(s)}`);
    assert.ok(s.feedUrl?.trim(), `${s.name} is missing a feed URL`);
    assert.ok(s.siteUrl?.trim(), `${s.name} is missing a site URL`);
  }
});

test('no two sources share a name', () => {
  const seen = new Set();
  for (const s of SOURCES) {
    const key = s.name.trim().toLowerCase();
    assert.equal(seen.has(key), false, `duplicate source name: ${s.name}`);
    seen.add(key);
  }
});

test('no two sources share a feed URL', () => {
  // Two names on one feed is not an error the database would catch, and it
  // doubles every article that feed publishes.
  const seen = new Set();
  for (const s of SOURCES) {
    assert.equal(seen.has(s.feedUrl), false, `duplicate feed URL: ${s.feedUrl}`);
    seen.add(s.feedUrl);
  }
});

test('every feed URL is https', () => {
  for (const s of SOURCES) {
    assert.match(s.feedUrl, /^https:\/\//, `${s.name} is not fetched over https`);
  }
});

test('every source belongs to a market that exists', () => {
  for (const s of SOURCES) {
    assert.equal(isKnownMarket(s.market), true,
      `${s.name} is tagged "${s.market}", which is not in MARKETS`);
  }
});

test('every source polls daily or weekly, and nothing else', () => {
  for (const s of SOURCES) {
    assert.ok(['DAILY', 'WEEKLY'].includes(s.pollingFrequency),
      `${s.name} has frequency "${s.pollingFrequency}"`);
  }
});

test('every source declares at least one project type', () => {
  // An empty type list is not "all types" anywhere in the app — it is a source
  // that answers no filter and quietly never surfaces.
  for (const s of SOURCES) {
    assert.ok(Array.isArray(s.projectTypes) && s.projectTypes.length > 0,
      `${s.name} has no project types`);
  }
});

// ── Coverage — the thing the catalog exists to fix ──────────────────────────

test('the markets we actually sell into all have at least one local source', () => {
  // The finding this whole change came from: 20 of 21 sources were national,
  // and zero of 191 collected articles ever named one of our jobs. If somebody
  // strips the local papers back out, this fails.
  for (const market of ['DENVER', 'HOUSTON', 'AUSTIN', 'DALLAS']) {
    const local = SOURCES.filter(s => s.market === market);
    assert.ok(local.length >= 1, `no sources at all for ${market}`);
  }
});

test('local sources outnumber nothing — more than one paper is not national', () => {
  const local = SOURCES.filter(s => s.market !== DEFAULT_MARKET);
  assert.ok(local.length >= 10, `only ${local.length} local sources`);
});

// ── The seeder's contract ──────────────────────────────────────────────────

test('an empty database is missing the whole catalog', () => {
  assert.equal(missingSources([]).length, SOURCES.length);
});

test('a database that already has everything is missing nothing', () => {
  assert.deepEqual(missingSources(SOURCES.map(s => s.name)), []);
});

test('names match regardless of case and stray whitespace', () => {
  // The names came out of a database round trip, not out of this file.
  const noisy = SOURCES.map(s => `  ${s.name.toUpperCase()}  `);
  assert.deepEqual(missingSources(noisy), []);
});

test('only what is genuinely absent comes back', () => {
  const have = SOURCES.slice(0, 5).map(s => s.name);
  const missing = missingSources(have);
  assert.equal(missing.length, SOURCES.length - 5);
  assert.equal(missing.some(m => have.includes(m.name)), false);
});

test('a source we do not know about does not confuse the count', () => {
  // Somebody hand-adds a paper. The seeder must not try to remove it, and must
  // not count it towards the catalog being complete.
  assert.equal(missingSources(['Some Local Paper Nobody Told Us About']).length, SOURCES.length);
});

// ── Display helpers ─────────────────────────────────────────────────────────

test('grouping keeps every source and drops empty markets', () => {
  const groups = groupByMarket();
  const total = groups.reduce((n, g) => n + g.sources.length, 0);
  assert.equal(total, SOURCES.length, 'a source went missing between list and groups');
  assert.equal(groups.every(g => g.sources.length > 0), true);
});

test('groups come back in the order MARKETS declares', () => {
  const order = groupByMarket().map(g => g.key);
  const expected = MARKETS.map(m => m.key).filter(k => order.includes(k));
  assert.deepEqual(order, expected);
});

test('an unknown market key renders as itself rather than blank', () => {
  assert.equal(marketLabel('DENVER'), 'Denver & Colorado');
  assert.equal(marketLabel('BOISE'), 'BOISE');
  assert.equal(marketLabel(''), DEFAULT_MARKET);
  assert.equal(marketLabel(undefined), DEFAULT_MARKET);
});

// ── Feeds we have given up on ───────────────────────────────────────────────

test('nothing is both in the catalog and retired', () => {
  // The two lists contradict each other if a name is on both: the seeder would
  // add the source and the page would immediately offer to turn it off again.
  const both = SOURCES.filter(s => isRetired(s.name)).map(s => s.name);
  assert.deepEqual(both, [], `listed as both live and retired: ${both.join(', ')}`);
});

test('every retired source says why', () => {
  // "It stopped working" a year from now is not enough to decide whether to
  // try it again. The observed failure is the whole value of the record.
  for (const r of RETIRED) {
    assert.ok(r.name?.trim(), 'a retired entry has no name');
    assert.ok(r.reason?.trim(), `${r.name} is retired with no reason given`);
  }
});

test('no source is retired twice', () => {
  const seen = new Set();
  for (const r of RETIRED) {
    const key = r.name.trim().toLowerCase();
    assert.equal(seen.has(key), false, `retired twice: ${r.name}`);
    seen.add(key);
  }
});

test('retirement is matched the same way the seeder matches names', () => {
  // Names come back out of a database, not out of this file.
  assert.equal(isRetired('  HUD NEWS  '), true);
  assert.equal(isRetired('Multi-Housing News'), false);
  assert.equal(isRetired(''), false);
  assert.equal(isRetired(undefined), false);
});

test('only sources that are retired AND still switched on are offered up', () => {
  // Offering to turn off something already off would report work that is not
  // there; offering to turn off a live source would be a bug with teeth.
  const rows = [
    { id: '1', name: 'HUD News',           isActive: true  },
    { id: '2', name: 'NLIHC',              isActive: false },
    { id: '3', name: 'Multi-Housing News', isActive: true  },
  ];
  assert.deepEqual(retiredStillActive(rows).map(r => r.id), ['1']);
  assert.deepEqual(retiredStillActive([]), []);
  assert.deepEqual(retiredStillActive(), []);
});
