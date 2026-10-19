// Bid Leveling engine against the Sun Valley Block 2 bids (bidplan section 12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTag, rollUpLengths } from '../../src/lib/bidLeveling/normalizeTag.js';
import { buildMatrix, normalize, deriveFlags, buildClarifications, confidenceLevel } from '../../src/lib/bidLeveling/engine.js';
import { ILC_BID, FISHER_BID, SUN_VALLEY_PLACEHOLDERS, SUN_VALLEY_SETTINGS } from './_sunValleyBids.mjs';

const BIDS = [ILC_BID, FISHER_BID];
const TODAY = new Date('2026-10-18T12:00:00');
const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} not within ${tol} of ${expected}`);

test('tag spellings share one key', () => {
  for (const t of ['LT03', 'LT 03', 'LT-3', 'LT-03']) assert.equal(normalizeTag(t).matchKey, 'LT3');
  assert.deepEqual(normalizeTag("R1-24'"), { typeTag: 'R1', variant: "24'", lengthFt: 24, matchKey: 'R1' });
  assert.equal(normalizeTag('R1 24FT').lengthFt, 24);
  assert.equal(normalizeTag("S4-10.5'").lengthFt, 10.5);
  assert.equal(normalizeTag('ZP1-P').variant, 'P');
  assert.equal(normalizeTag('ZP1 POLE').variant, 'P');
  assert.equal(normalizeTag('S3.1').typeTag, 'S3.1');
  assert.equal(normalizeTag('ULT-01').matchKey, 'ULT1');
  assert.equal(normalizeTag('R4', { mfr: 'MISC', catalog: 'FIRE HOOD ALLOWANCE' }).variant, 'HOOD');
  assert.equal(normalizeTag('R4', { mfr: 'CSL', catalog: 'ED3L-SAIC' }).variant, '');
});

test('length roll up sums feet or counts', () => {
  const parts = [{ qty: 2, lengthFt: 6 }, { qty: 1, lengthFt: 8 }];
  assert.equal(rollUpLengths(parts, 'LF').qty, 20);
  assert.equal(rollUpLengths(parts, 'EA').qty, 3);
});

const matrix = buildMatrix(BIDS, 'fisher');
const row = (key) => matrix.types.find((t) => t.key === key);

test('matrix lines up Sun Valley on the type tag', () => {
  assert.equal(row('R1').cells.fisher.qty, 371);
  assert.equal(row('R1').cells.fisher.uom, 'LF');
  assert.equal(row('S4').cells.fisher.qty, 22);
  assert.equal(row('S4').cells.fisher.uom, 'EA');
  for (const [k, q] of [['ZP1', 6], ['ZP3', 8], ['ZR1', 28], ['ZW3', 32], ['S10', 17], ['W3E', 16]]) {
    assert.equal(row(k).cells.fisher.qty, q, k);
    assert.equal(row(k).cells.ilc.deltaQtyVsBaseline, 0, `${k} exact match`);
  }
  // ILC's pole line folds into the head price.
  near(row('ZP1').cells.ilc.unitPrice, 1159.74 + 505.19, 0.01, 'ZP1 with pole');
  assert.equal(row('R4/HOOD').cells.ilc, undefined);
  assert.equal(row('LT3').cells.fisher.specBasis, 'NOT_USED');
  // R6: Fisher 1 EA vs ILC 8 LF is a unit clash, not a delta.
  assert.equal(row('R6').cells.ilc.uomMismatch, true);
  assert.equal(row('R6').cells.ilc.deltaQtyVsBaseline, null);
});

test('quantity variances match the plan', () => {
  const got = Object.fromEntries(matrix.qtyVariances.map((v) => [v.typeTag, Math.abs(v.delta)]));
  // The plan's eight, plus LT-01 (7 units but about $4,500 at ILC's price).
  assert.deepEqual(got, { US1B: 2811, UC1: 985, US2B: 386, 'ULT-02': 227, S9: 153, 'ULT-01': 95, ZW1: 66, S3: 41, 'LT-01': 7 });
  near(matrix.qtyVariances.find((v) => v.typeTag === 'LT-01').dollars, 4545, 1, 'LT-01 dollars');
});

test('scope gaps both ways', () => {
  const gaps = Object.fromEntries(matrix.scopeGaps.map((g) => [g.key, g.presentIn.join('+')]));
  for (const k of ['UC2', 'UR1', 'S12', 'R4/HOOD']) assert.equal(gaps[k], 'fisher', k);
  // LT5 and UNTAGGED are ILC only (the plan's list left them out).
  for (const k of ['ZS1', 'ULT3', 'LT8', 'PS1', 'LT5', 'UNTAGGED']) assert.equal(gaps[k], 'ilc', k);
  assert.match(matrix.scopeGaps.find((g) => g.key === 'ZS1').note.fisher, /^Zero quantity: 4 RUNS/);
});

test('ILC normalized on Fisher quantities', () => {
  const n = normalize(BIDS, 'fisher', { ...SUN_VALLEY_SETTINGS, placeholders: SUN_VALLEY_PLACEHOLDERS }, matrix);
  const ilc = n.perBid.ilc;
  assert.equal(ilc.fixturesPlaceholder, 319785);
  // Plan section 12 values; actuals on 10-18: matched 647,942, tax 100,102,
  // freight 69,877, warehousing 34,939, grand 1,298,926.
  near(ilc.fixturesMatched, 648114, 500, 'matched');
  near(ilc.controls, 126282, 1, 'controls');
  near(ilc.tax, 100118, 500, 'tax');
  near(ilc.freight, 69889, 500, 'freight');
  near(ilc.warehousing, 34945, 500, 'warehousing');
  near(ilc.grand, 1299132, 500, 'grand');
  assert.equal(ilc.confidence.placeholderShare, 0.33);
  assert.ok(['LOW', 'MEDIUM'].includes(ilc.confidence.level));
  // R6 has no price anywhere: zero and flagged.
  assert.equal(ilc.placeholderLines.find((p) => p.typeTag === 'R6').basis, 'NONE');

  const extras = Object.fromEntries(n.extrasNotInBaseline.ilc.map((e) => [e.typeTag, e.extPrice]));
  near(extras.ZS1, 12274, 1, 'ZS1');
  near(extras['ULT-03'], 3350, 1, 'ULT-03');
  near(extras['LT-08'], 5844, 1, 'LT-08');
  near(extras.PS1, 6036, 1, 'PS1');

  assert.equal(n.perBid.fisher.sectionOnly, true);
  assert.equal(n.perBid.fisher.grand, 1591080);
  assert.equal(n.perBid.fisher.confidence.level, 'LOW');
});

test('confidence tiers', () => {
  assert.equal(confidenceLevel(0.05, 2, true), 'HIGH');
  assert.equal(confidenceLevel(0.2, 10, true), 'MEDIUM');
  assert.equal(confidenceLevel(0.4, 5, true), 'MEDIUM');
  assert.equal(confidenceLevel(0.4, 10, true), 'LOW');
  assert.equal(confidenceLevel(0, 0, false), 'LOW');
});

test('Fisher flags the numbers prove', () => {
  const f = deriveFlags(FISHER_BID, TODAY);
  assert.equal(f.tax.state, 'CONTRADICTION');
  near(f.tax.check.computed, 114249, 1, 'tax at 8%');
  assert.equal(f.validity.state, 'EXPIRED');
  assert.equal(f.unit_pricing.state, 'EXCLUDED');
  // ILC charges 9.15% on fixtures plus controls: reconciles.
  assert.equal(deriveFlags(ILC_BID, TODAY).tax.state, 'INCLUDED');
});

test('Fisher clarifications', () => {
  const qs = buildClarifications(FISHER_BID, matrix, { today: TODAY, bids: BIDS });
  const all = qs.join('\n');
  for (const re of [/unit pricing by type/, /expired Aug 5, 2026/, /\$162,964 does not match 8%/, /S6E, W1E/,
    /Stage and store/, /UR1: .*1,399/, /LT-08, ZS1: quoted at zero/, /PS1: not on this quote/, /LT05: marked no quote/,
    /R6 \(EA\)/, /US1B/, /Tariff clause/, /contractor net or distributor net/]) {
    assert.match(all, re);
  }
  assert.equal(qs.length, 13);
  assert.doesNotMatch(all, /[–—]|--/, 'no dashes in text that goes out');
});
