/**
 * Unit tests for the public conceptual-budget intake helpers.
 * Zero dependencies, node:test only. Run: npm run test:intake
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail, parseEmailDomain, classifyIntakeEmail,
  resolveClientByDomain, websiteHost,
  normalizeProjectName, nameSimilarity, findDuplicateProjects,
} from '../../src/lib/intake.js';

// ─── EMAIL PARSING ──────────────────────────────────────────────────────────

test('normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  Bob@Acme.COM '), 'bob@acme.com');
  assert.equal(normalizeEmail(null), '');
});

test('parseEmailDomain handles the messy cases', () => {
  assert.equal(parseEmailDomain('bob@acme.com'), 'acme.com');
  assert.equal(parseEmailDomain('bob+jobs@acme.com'), 'acme.com', 'subaddressing kept');
  assert.equal(parseEmailDomain('a@b@acme.com'), 'acme.com', 'splits on LAST @');
  assert.equal(parseEmailDomain('@acme.com'), '', 'no local part');
  assert.equal(parseEmailDomain('bob@'), '', 'no domain');
  assert.equal(parseEmailDomain('nonsense'), '');
});

// ─── WORK-EMAIL GATING ──────────────────────────────────────────────────────

test('work emails pass', () => {
  for (const e of ['bob@milenderwhite.com', 'j.doe@sub.acme.co.uk', 'PM@ilcstudios.com']) {
    const r = classifyIntakeEmail(e);
    assert.equal(r.ok, true, `${e} should pass, got ${r.code}`);
    assert.equal(r.code, 'OK');
  }
});

test('free mail is rejected with a helpful message', () => {
  for (const e of ['bob@gmail.com', 'bob@YAHOO.com', 'x@icloud.com', 'y@comcast.net']) {
    const r = classifyIntakeEmail(e);
    assert.equal(r.ok, false, `${e} should be rejected`);
    assert.equal(r.code, 'FREE_EMAIL');
    assert.match(r.message, /work email/i);
  }
});

test('disposable mail is rejected and distinguished from free mail', () => {
  const r = classifyIntakeEmail('spam@mailinator.com');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DISPOSABLE');
});

test('malformed addresses are rejected before domain checks', () => {
  for (const e of ['', '   ', 'bob', 'bob@', '@acme.com', 'bob acme.com', 'bob@acme']) {
    const r = classifyIntakeEmail(e);
    assert.equal(r.ok, false, `${JSON.stringify(e)} should be rejected`);
    assert.equal(r.code, 'INVALID');
  }
});

test('a company subdomain of a free provider is NOT treated as free mail', () => {
  // Only the exact domain is blocked; "acme.gmail.com" is not gmail.
  assert.equal(classifyIntakeEmail('bob@acme.gmail.com').ok, true);
});

// ─── CLIENT RESOLUTION ──────────────────────────────────────────────────────

const CLIENTS = [
  { id: 'c1', name: 'Milender White', emailDomains: ['milenderwhite.com'], website: 'https://www.milenderwhite.com' },
  { id: 'c2', name: 'Lincoln Avenue Capital', emailDomains: ['lincolnavecap.com', 'lacap.com'] },
  { id: 'c3', name: 'Acme Builders', emailDomains: [], website: 'acmebuilders.com/about' },
];

test('explicit emailDomains match is high confidence', () => {
  const r = resolveClientByDomain('lacap.com', CLIENTS);
  assert.equal(r.clientId, 'c2');
  assert.equal(r.matchType, 'domain');
  assert.equal(r.confidence, 'high');
});

test('domain match is case and whitespace insensitive', () => {
  assert.equal(resolveClientByDomain('  LACAP.COM ', CLIENTS).clientId, 'c2');
});

test('website match is returned as a LOW confidence suggestion, not an assignment', () => {
  const r = resolveClientByDomain('acmebuilders.com', CLIENTS);
  assert.equal(r.clientId, 'c3');
  assert.equal(r.matchType, 'website');
  assert.equal(r.confidence, 'low', 'website is free text, must not auto-assign');
});

test('explicit domain beats website when both could match', () => {
  const r = resolveClientByDomain('milenderwhite.com', CLIENTS);
  assert.equal(r.matchType, 'domain', 'authoritative source wins');
});

test('unknown domain resolves to nothing rather than guessing', () => {
  const r = resolveClientByDomain('totallyunknown.com', CLIENTS);
  assert.equal(r.clientId, null);
  assert.equal(r.matchType, 'none');
});

test('empty domain and empty client list are safe', () => {
  assert.equal(resolveClientByDomain('', CLIENTS).matchType, 'none');
  assert.equal(resolveClientByDomain('acme.com', []).matchType, 'none');
  assert.equal(resolveClientByDomain('acme.com', [{ id: 'x', name: 'X' }]).matchType, 'none');
});

test('websiteHost strips scheme, www, path and query', () => {
  assert.equal(websiteHost('https://www.acme.com/about?x=1'), 'acme.com');
  assert.equal(websiteHost('acme.com'), 'acme.com');
  assert.equal(websiteHost('not a url'), '');
  assert.equal(websiteHost(''), '');
});

// ─── PROJECT NAME NORMALIZATION ─────────────────────────────────────────────

test('normalizeProjectName only removes cosmetic differences', () => {
  assert.equal(normalizeProjectName('The Approach'), 'approach');
  assert.equal(normalizeProjectName('  THE   Approach!! '), 'approach');
  assert.equal(normalizeProjectName('Lincoln-Avenue'), 'lincoln avenue');
});

test('project normalizer does NOT strip meaningful words the company normalizer would', () => {
  // market-intel/normalizer.js strips "residential"/"development" as company
  // noise. For project names those distinguish real, separate jobs.
  assert.notEqual(
    normalizeProjectName('Lincoln Avenue Residential'),
    normalizeProjectName('Lincoln Avenue'),
    'these are different projects and must not collapse together',
  );
});

// ─── DUPLICATE DETECTION ────────────────────────────────────────────────────

const EXISTING = [
  { id: 'p1', name: 'The Approach',        clientName: 'Milender White' },
  { id: 'p2', name: 'Lincoln Avenue',      clientName: 'LAC' },
  { id: 'p3', name: 'Westgate Apartments', clientName: 'Acme' },
];

test('exact duplicate is found regardless of case and articles', () => {
  const m = findDuplicateProjects('the approach', EXISTING);
  assert.equal(m.length, 1);
  assert.equal(m[0].id, 'p1');
  assert.equal(m[0].kind, 'exact');
});

test('a superset name is flagged as contains, not missed', () => {
  const m = findDuplicateProjects('Westgate Apartments Phase 2', EXISTING);
  assert.equal(m[0].id, 'p3');
  assert.equal(m[0].kind, 'contains');
});

test('unrelated name produces no false positive', () => {
  assert.deepEqual(findDuplicateProjects('Harbor Point Tower', EXISTING), []);
});

test('empty or junk name returns nothing rather than matching everything', () => {
  assert.deepEqual(findDuplicateProjects('', EXISTING), []);
  assert.deepEqual(findDuplicateProjects('!!!', EXISTING), []);
});

test('matches come back strongest-first', () => {
  const existing = [
    { id: 'a', name: 'Lincoln Avenue Phase Two' },
    { id: 'b', name: 'Lincoln Avenue' },
  ];
  const m = findDuplicateProjects('Lincoln Avenue', existing);
  assert.equal(m[0].id, 'b', 'exact match ranks above contains');
  assert.equal(m[0].kind, 'exact');
});

test('nameSimilarity is symmetric and bounded', () => {
  assert.equal(nameSimilarity('Lincoln Avenue', 'Avenue Lincoln'), 1, 'token order ignored');
  assert.equal(nameSimilarity('Lincoln Avenue', 'Lincoln Avenue'), 1);
  assert.equal(nameSimilarity('abc', 'xyz'), 0);
  assert.equal(nameSimilarity('', 'Lincoln'), 0);
});
