// Unit tests for the redaction boundary (src/lib/redact.js).
// Pure, no server, no DB, so this runs in the static `npm run verify` gate.
//
// The two bugs that motivated the module are pinned as regression tests below:
// the CO PDF route that never checked its auth error, and the CO share route
// that dropped `originalDN` but shipped `marginPct` (from which DN is exact).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  redact, findIlcOnly, assertNoIlcOnly, audienceForRole, AUDIENCE, ILC_ONLY_FIELDS,
} from '../../src/lib/redact.js';

// A payload shaped like the real /api/share/co/[token] response.
const coPayload = () => ({
  co: {
    coNumber: 'CO-00001',
    project:  { id: 'p1', name: 'The Approach' },
    optionGroups: [{
      label: 'Option A',
      lineItems: [
        { fixtureType: 'F1', qty: 10, cnUnitPrice: 100, originalDN: 77, notes: 'ok' },
        { fixtureType: 'F2', qty: 2,  cnUnitPrice: 250, originalDN: null },
      ],
      footer: { subtotal: 1500, total: 1772.25 },
    }],
  },
  rates: { salesTaxPct: 0.0815, freightPct: 0.06, warehousingPct: 0.03, marginPct: 0.23 },
});

test('ILC audience is a pass-through: internal screens keep every field', () => {
  const input = coPayload();
  const out   = redact(input, AUDIENCE.ILC);
  assert.equal(out, input, 'ILC should get the identical object back, not a copy');
  assert.equal(out.rates.marginPct, 0.23);
  assert.equal(out.co.optionGroups[0].lineItems[0].originalDN, 77);
});

test('PUBLIC audience strips buy price at every nesting depth', () => {
  const out = redact(coPayload(), AUDIENCE.PUBLIC);
  for (const li of out.co.optionGroups[0].lineItems) {
    assert.ok(!('originalDN' in li), 'originalDN survived redaction');
  }
  // Client-facing numbers must be untouched.
  assert.equal(out.co.optionGroups[0].lineItems[0].cnUnitPrice, 100);
  assert.equal(out.co.optionGroups[0].footer.total, 1772.25);
  assert.equal(out.co.project.name, 'The Approach');
});

test('REGRESSION: marginPct is stripped. Publishing it publishes the buy price', () => {
  // cn = dn / (1 - marginPct)  ⟹  dn = cn × (1 - marginPct).
  // The old share route dropped originalDN and then handed over marginPct,
  // so 100 × (1 - 0.23) = 77 recovered the DN exactly. Verify the arithmetic
  // still works on the raw data, then that redaction breaks it.
  const raw = coPayload();
  const li  = raw.co.optionGroups[0].lineItems[0];
  assert.equal(Math.round(li.cnUnitPrice * (1 - raw.rates.marginPct)), li.originalDN,
    'sanity: DN really is recoverable from CN + margin');

  const out = redact(raw, AUDIENCE.PUBLIC);
  assert.ok(!('marginPct' in out.rates), 'marginPct leaked to a public audience');
  // The rates the share page actually renders must survive.
  assert.equal(out.rates.salesTaxPct, 0.0815);
  assert.equal(out.rates.freightPct, 0.06);
  assert.equal(out.rates.warehousingPct, 0.03);
});

test('CLIENT audience is stripped the same as PUBLIC', () => {
  assert.deepStrictEqual(
    redact(coPayload(), AUDIENCE.CLIENT),
    redact(coPayload(), AUDIENCE.PUBLIC),
  );
});

test('redaction never mutates its input: footers are computed before transport', () => {
  const input = coPayload();
  redact(input, AUDIENCE.PUBLIC);
  assert.equal(input.rates.marginPct, 0.23, 'input was mutated');
  assert.equal(input.co.optionGroups[0].lineItems[0].originalDN, 77, 'input was mutated');
});

test('every ILC-only field name is actually stripped', () => {
  const all = Object.fromEntries([...ILC_ONLY_FIELDS].map(f => [f, 'SECRET']));
  const out = redact({ nested: { deep: [{ ...all }] }, ...all }, AUDIENCE.PUBLIC);
  assert.deepStrictEqual(findIlcOnly(out), []);
});

test('audience is required: a forgotten argument throws instead of picking a policy', () => {
  assert.throws(() => redact({}, undefined), /audience must be one of/);
  assert.throws(() => redact({}, 'internal'), /audience must be one of/);
  assert.throws(() => redact({}, true), /audience must be one of/);
});

test('non-object payloads pass through unharmed', () => {
  assert.equal(redact(null, AUDIENCE.PUBLIC), null);
  assert.equal(redact(42, AUDIENCE.PUBLIC), 42);
  assert.equal(redact('x', AUDIENCE.PUBLIC), 'x');
  assert.deepStrictEqual(redact([], AUDIENCE.PUBLIC), []);
});

test('Date values survive as Dates, not as walked-into objects', () => {
  const d   = new Date('2026-08-08T00:00:00Z');
  const out = redact({ date: d, originalDN: 1 }, AUDIENCE.PUBLIC);
  assert.ok(out.date instanceof Date);
  assert.equal(out.date.toISOString(), d.toISOString());
  assert.ok(!('originalDN' in out));
});

test('findIlcOnly reports actionable dotted paths', () => {
  const hits = findIlcOnly(coPayload());
  assert.ok(hits.includes('co.optionGroups[0].lineItems[0].originalDN'), hits.join(', '));
  assert.ok(hits.includes('rates.marginPct'), hits.join(', '));
});

test('assertNoIlcOnly throws on a dirty payload and names the field', () => {
  assert.throws(() => assertNoIlcOnly(coPayload(), 'share/co'), /share\/co leaks ILC-only field/);
  assert.doesNotThrow(() => assertNoIlcOnly(redact(coPayload(), AUDIENCE.PUBLIC), 'share/co'));
});

test('audienceForRole: no session degrades to the MOST redacted view', () => {
  assert.equal(audienceForRole(undefined), AUDIENCE.PUBLIC);
  assert.equal(audienceForRole(null), AUDIENCE.PUBLIC);
  assert.equal(audienceForRole(''), AUDIENCE.PUBLIC);
});

test('audienceForRole: CLIENT_VIEWER cannot reach the ILC view', () => {
  assert.equal(audienceForRole('CLIENT_VIEWER'), AUDIENCE.CLIENT);
  for (const role of ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN', 'ADMIN', 'USER']) {
    assert.equal(audienceForRole(role), AUDIENCE.ILC, `${role} should be ILC`);
  }
});

test('audienceForRole agrees with isClientViewer() in src/lib/auth.js', async () => {
  // redact.js repeats the 'CLIENT_VIEWER' literal rather than importing auth.js
  // (which pulls in next/headers). Read the source to prove they haven't drifted.
  const { readFileSync } = await import('node:fs');
  const authSrc = readFileSync(new URL('../../src/lib/auth.js', import.meta.url), 'utf8');
  const match   = authSrc.match(/export function isClientViewer\(role\)\s*\{\s*return role === '([A-Z_]+)'/);
  assert.ok(match, 'could not locate isClientViewer() in src/lib/auth.js, update this test');
  assert.equal(audienceForRole(match[1]), AUDIENCE.CLIENT,
    `auth.js treats '${match[1]}' as a client viewer but redact.js does not`);
});
