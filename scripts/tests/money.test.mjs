/**
 * One rounding rule everywhere (Mike 2026-10-31): round to the cent first, then
 * do the next step with the rounded number, so everything printed adds up by
 * hand and never lands a penny off.
 *
 * Run: node --test scripts/tests/money.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cents, lineTotal, sumCents } from '../../src/lib/money.js';
import { calcGroupFooter } from '../../src/lib/changeOrderTotals.js';
import { matrixFooter } from '../../src/lib/bidMatrixTotals.js';
import { calculateBudget } from '../../src/lib/calculations.js';

// Whole cents as an integer, so the by-hand adds below have no float noise.
const pennies = n => Math.round(n * 100);
const isWholeCents = n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

// The same random jobs every run, so a failure can be chased down.
function randomFrom(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test('cents rounds half up and a credit mirrors a charge', () => {
  assert.equal(cents(1.005), 1.01);
  assert.equal(cents(2.675), 2.68);
  assert.equal(cents(1.4999), 1.5);
  assert.equal(cents(0.125), 0.13);
  assert.equal(cents(-1.005), -1.01);
  assert.equal(cents(-2.675), -2.68);
  assert.equal(cents(1234567.895), 1234567.9);
});

test('cents treats blanks and junk as zero and never returns negative zero', () => {
  assert.equal(cents(null), 0);
  assert.equal(cents(undefined), 0);
  assert.equal(cents(NaN), 0);
  assert.equal(cents(Infinity), 0);
  assert.equal(cents('12.345'), 12.35);
  assert.ok(Object.is(cents(-0.001), 0));
});

test('lineTotal rounds the price first, so quantity times the shown price is the line', () => {
  assert.equal(lineTotal(3, 12.345), 37.05);
  assert.equal(lineTotal(7, 19.995), 140);
  assert.equal(lineTotal(null, 10), 0);
  assert.equal(lineTotal(4, null), 0);
  assert.equal(lineTotal(-2, 50.255), -100.52);
});

test('sumCents adds rounded amounts and clears float noise', () => {
  assert.equal(sumCents([0.1, 0.2]), 0.3);
  assert.equal(sumCents([1.005, 1.005]), 2.02);
  assert.equal(sumCents([null, undefined, 5]), 5);
  assert.equal(sumCents([]), 0);
});

test('a change order footer adds up by hand on 2,000 random jobs', () => {
  const r = randomFrom(11);
  for (let job = 0; job < 2000; job++) {
    const lines = Array.from({ length: 1 + Math.floor(r() * 12) }, () => ({
      qty: 1 + Math.floor(r() * 500),
      cnUnitPrice: Math.round(r() * 200000) / 100 * (r() < 0.1 ? -1 : 1) + (r() < 0.2 ? 0.0049 : 0),
    }));
    const rates = { salesTaxPct: 0.0845, freightPct: 0.06, warehousingPct: 0.03 };
    const discount = r() < 0.3 ? { discountPct: 0.0725 } : r() < 0.5 ? { discountAmount: 123.455 } : null;
    const f = calcGroupFooter(lines, rates, discount);

    for (const v of Object.values(f)) assert.ok(isWholeCents(v), `${v} is not whole cents`);

    const byHand = lines.reduce((s, l) => s + pennies(lineTotal(l.qty, l.cnUnitPrice)), 0);
    assert.equal(pennies(f.subtotal), byHand);
    assert.equal(
      pennies(f.total),
      pennies(f.subtotal) - pennies(f.discount) + pennies(f.tax) + pennies(f.freight) + pennies(f.warehousing),
    );
  }
});

test('a Bid Matrix footer adds up by hand and both subtotals reach the Grand Total', () => {
  const r = randomFrom(23);
  for (let job = 0; job < 2000; job++) {
    const f = matrixFooter(
      r() < 0.1 ? 0 : Math.round(r() * 200000000) / 100,
      r() < 0.2 ? 0 : Math.round(r() * 30000000) / 100,
      { freightPct: 0.06, warehousingPct: 0.03, salesTaxPct: r() < 0.5 ? 0.0775 : 0.0845 },
    );
    assert.equal(pennies(f.totalAdders), pennies(f.freightAmt) + pennies(f.warehousingAmt) + pennies(f.salesTaxAmt));
    assert.equal(pennies(f.grandTotal), pennies(f.rawTotal) + pennies(f.totalAdders));
    assert.equal(pennies(f.subtotalLighting) + pennies(f.subtotalControls), pennies(f.grandTotal));
  }
});

test('a Bid Matrix with one side empty keeps that side at zero', () => {
  const rates = { freightPct: 0.06, warehousingPct: 0.03, salesTaxPct: 0.0775 };
  const lightingOnly = matrixFooter(1000.33, 0, rates);
  assert.equal(lightingOnly.subtotalControls, 0);
  assert.equal(lightingOnly.subtotalLighting, lightingOnly.grandTotal);
  const controlsOnly = matrixFooter(0, 1000.33, rates);
  assert.equal(controlsOnly.subtotalLighting, 0);
  assert.equal(controlsOnly.subtotalControls, controlsOnly.grandTotal);
});

test('a Budget adds up by hand at the cent on 300 random jobs', () => {
  const r = randomFrom(37);
  for (let job = 0; job < 300; job++) {
    const numUnits = 20 + Math.floor(r() * 400);
    const pd = {
      numUnits,
      grossSf: numUnits * (800 + Math.floor(r() * 700)),
      corridorSf: Math.floor(r() * 40000),
      garageSf: r() < 0.5 ? Math.floor(r() * 90000) : 0,
      salesTaxPct: r() < 0.5 ? 0.0775 : 0.0845,
      freightPct: 0.06,
      warehousingPct: 0.03,
      contingencyPct: r() < 0.3 ? 5 : 0,
    };
    const b = calculateBudget(pd, {});
    const u = b.sections.units;

    for (const v of [
      b.lightingProductSubtotal, b.freight, b.warehousing, b.lightingTaxAmount, b.subtotalLightingOnly,
      b.controls, b.controlsSubtotal, b.controlsTotal, b.totalWithControls, b.contingencyAmount, b.totalWithContingency,
    ]) assert.ok(isWholeCents(v), `${v} is not whole cents`);

    assert.equal(
      pennies(u.total.product),
      pennies(u.base.product) + pennies(u.undercabinet.product) + pennies(u.pendants.product)
        + pennies(u.fans.product) + pennies(u.vanity.product) + pennies(u.balcony.product),
    );
    assert.equal(
      pennies(b.subtotalLightingOnly),
      pennies(b.lightingProductSubtotal) + pennies(b.freight) + pennies(b.warehousing) + pennies(b.lightingTaxAmount),
    );
    assert.equal(
      pennies(b.controlsTotal),
      pennies(b.controlsSubtotal) + pennies(b.controlsFreight) + pennies(b.controlsWarehousing) + pennies(b.controlsTaxAmount),
    );
    assert.equal(pennies(b.totalWithControls), pennies(b.subtotalLightingOnly) + pennies(b.controlsTotal));
    assert.equal(pennies(b.totalWithContingency), pennies(b.totalWithControls) + pennies(b.contingencyAmount));
  }
});

test('nobody rounds money by hand outside money.js', () => {
  // Quantities, scores, percents and learning samples, not money on a page.
  const allowed = new Set([
    'src/lib/money.js',
    'src/lib/areaSheet.js',
    'src/lib/calibration/areaNorms.js',
    'src/lib/calibration/lines.js',
    'src/app/(app)/project/[id]/PeerReviewClient.jsx',
    'src/lib/bidLeveling/normalizeTag.js',
    'src/lib/calibration/capture.js',
    'src/lib/calibration/figureNorms.js',
    'src/lib/market-intel/permitRules.js',
    'src/lib/rfq/match.js',
    'src/lib/rfq/pdfHtml.js',
  ]);
  const handRound = /Math\.round\([^;\n]*\* ?100\) ?\/ ?100/;
  const found = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.jsx?$/.test(e.name)) {
        const rel = full.split(path.sep).join('/');
        if (!allowed.has(rel) && handRound.test(fs.readFileSync(full, 'utf8'))) found.push(rel);
      }
    }
  };
  walk('src');
  assert.deepEqual(found, [], 'Use cents, lineTotal or sumCents from src/lib/money.js');
});
