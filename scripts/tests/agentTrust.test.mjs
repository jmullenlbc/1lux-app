// Trust tiers — Step 18 of the Governed AI Layer, Slice 4b.
//
// `computeTier` and `needsReview` are pure, so this file needs no store, no
// clock and no database. That is deliberate: the tier rules are the part of this
// layer most likely to be argued about later, and an argument is much easier to
// settle against a test that states the rule in four lines than against one that
// needs a fixture database to run.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeTier, needsReview, TIER, PERMANENT_TIER_0, TIER_2_SAMPLE_RATE,
} from '../../src/lib/agentTrust.js';

/** n verdicts, `bad` of them non-accepted, with the bad ones LAST unless told otherwise. */
function history(n, bad = 0, { badFirst = false } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ verdict: 'accepted' });
  for (let i = 0; i < bad; i++) {
    if (badFirst) out[i] = { verdict: 'rejected' };
    else out[out.length - 1 - i] = { verdict: 'rejected' };
  }
  return out;
}

// ── Promotion ────────────────────────────────────────────────────────────────

test('a brand new task type is supervised, and says why', () => {
  const t = computeTier('extract.newThing', []);
  assert.equal(t.tier, TIER.SUPERVISED);
  assert.equal(t.verdicts, 0);
  assert.match(t.reason, /starts supervised/i);
});

test('nine perfect verdicts is still supervised — the count gate is real', () => {
  assert.equal(computeTier('extract.thing', history(9)).tier, TIER.SUPERVISED);
});

test('ten verdicts at 90% earns auto-edit', () => {
  // 9 accepted of 10 is exactly 90%, and the bad one is 1-in-10 so the
  // last-5 demotion window stays clean.
  const h = history(10, 1, { badFirst: true });
  const t = computeTier('extract.thing', h);
  assert.equal(t.tier, TIER.AUTO_EDIT);
  assert.equal(t.acceptRate, 0.9, 'the boundary is inclusive — 90% earns it');
});

test('twenty verdicts at 95% earns auto-write', () => {
  const t = computeTier('extract.thing', history(20, 1, { badFirst: true }));
  assert.equal(t.tier, TIER.AUTO_WRITE);
});

test('twenty verdicts at 90% earns auto-edit, not auto-write', () => {
  const t = computeTier('extract.thing', history(20, 2, { badFirst: true }));
  assert.equal(t.tier, TIER.AUTO_EDIT, '90% clears tier 1 but not tier 2');
});

// ── Demotion — the half people forget to build ───────────────────────────────

test('two non-accepted in the last five drops a tier, even on a long clean record', () => {
  // 100 verdicts, 98 accepted — a 98% lifetime record — but the last two failed.
  const h = history(100, 2);
  const t = computeTier('extract.thing', h);
  assert.equal(t.demoted, true);
  assert.equal(t.tier, TIER.AUTO_EDIT, 'auto-write drops to auto-edit');
  assert.match(t.reason, /Demoted/);
  assert.ok(t.acceptRate > 0.95, 'the lifetime rate still looks great — that is the point');
});

test('one bad verdict in the last five is not a demotion', () => {
  assert.equal(computeTier('extract.thing', history(100, 1)).demoted, false);
});

test('demotion cannot push below supervised', () => {
  const t = computeTier('extract.thing', history(5, 5));
  assert.equal(t.tier, TIER.SUPERVISED);
  assert.equal(t.demoted, false, 'already at the floor — nothing to demote');
});

test('a corrected verdict counts against acceptance, same as a rejection', () => {
  const h = [...history(98), { verdict: 'corrected' }, { verdict: 'corrected' }];
  const t = computeTier('extract.thing', h);
  assert.equal(t.demoted, true, '"corrected" means a human had to fix it — that is not an acceptance');
});

// ── Policy that data cannot override ─────────────────────────────────────────

test('code lookups and contract review are permanently supervised', () => {
  for (const taskType of PERMANENT_TIER_0) {
    const t = computeTier(taskType, history(500));   // a flawless record
    assert.equal(t.tier, TIER.SUPERVISED, `${taskType} must never be promoted`);
    assert.equal(t.permanent, true);
    assert.match(t.reason, /legal exposure/i);
  }
});

// ── needsReview ──────────────────────────────────────────────────────────────

test('a failed auto-check forces review at the highest tier', () => {
  const tier = computeTier('extract.thing', history(50));
  assert.equal(tier.tier, TIER.AUTO_WRITE);
  const d = needsReview(tier, false, () => 0.99);   // rng says "do not sample"
  assert.equal(d.review, true);
  assert.match(d.why, /auto-check/i);
});

test('a null auto-check is not a pass, but it is not a failure either', () => {
  const tier = computeTier('extract.thing', history(50));
  assert.equal(needsReview(tier, null, () => 0.99).review, false,
    'no check defined must not block an earned tier');
});

test('auto-edit always surfaces for review, but flags rather than holds', () => {
  const tier = computeTier('extract.thing', history(10, 1, { badFirst: true }));
  const d = needsReview(tier, true, () => 0.99);
  assert.equal(d.review, true);
  assert.equal(d.flagOnly, true, 'tier 1 writes and flags — it does not hold the write');
});

test('auto-write still samples ten percent, forever', () => {
  const tier = computeTier('extract.thing', history(50));
  assert.equal(needsReview(tier, true, () => 0.05).sampled, true, 'below the rate — sampled');
  assert.equal(needsReview(tier, true, () => 0.5).review, false, 'above the rate — not sampled');
  assert.equal(TIER_2_SAMPLE_RATE, 0.10);
});

test('the sample rate holds up over many draws', () => {
  const tier = computeTier('extract.thing', history(50));
  // A deterministic sweep rather than real randomness: 1000 evenly spaced draws
  // across [0,1). Real RNG here would make the suite flaky, which is the exact
  // failure mode this project just spent a session removing.
  let sampled = 0;
  for (let i = 0; i < 1000; i++) {
    if (needsReview(tier, true, () => i / 1000).sampled) sampled++;
  }
  assert.equal(sampled, 100, 'exactly 10% of the sweep falls under the rate');
});
