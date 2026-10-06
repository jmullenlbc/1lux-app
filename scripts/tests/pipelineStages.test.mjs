/**
 * Pipeline stage vocabulary (Mike's list, 2026-09-07).
 *
 * There was no test on the stage list at all, which is exactly how three screens
 * ended up carrying their own typed-out copy of the stage names — the boards, the
 * home cards and the dashboards could each show a different word for the same
 * column. These assertions pin the two things that matter:
 *
 *   1. the LABELS are the five Mike asked for, in his order;
 *   2. the stored KEYS did not move when the labels were renamed.
 *
 * (2) is the one that would hurt. If someone later "tidies up" PRECONSTRUCTION
 * into DESIGN_PRECON to match the new label, every project row, saved bot rule,
 * dashboard filter and CSV in production still says PRECONSTRUCTION, and they all
 * quietly fall off the board. Rename the label freely; the key is a data value.
 *
 * Run: node --test scripts/tests/pipelineStages.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIPELINE_STAGES, STAGE_KEYS, STAGE_LABEL, DEFAULT_STAGE,
  LEGACY_DESIGN_STAGE, normalizeStage, stagesOutOfSync,
} from '../../src/lib/pipeline.js';

// ── The list Mike asked for ──────────────────────────────────────────────────

test('the Procurement board shows the five stages, in Mike\'s order', () => {
  const expected = [
    'Qualified',
    'Design / Pre-Con',
    'Buyout',
    'CA / Procurement',
    'Completed',
  ];
  assert.deepEqual(PIPELINE_STAGES.PROCUREMENT.map(s => s.label), expected);
});

test('the Design board is the same list with Proposal Sent added (10-5), not a second copy', () => {
  // Every Procurement column appears on Design, in the same order, built from
  // the same objects. The extra column is covered in pipelineProposalSent.test.mjs.
  const shared = PIPELINE_STAGES.DESIGN.filter(s => s.key !== 'PROPOSAL_SENT');
  assert.deepEqual(shared, PIPELINE_STAGES.PROCUREMENT);
  shared.forEach((s, i) => assert.equal(s, PIPELINE_STAGES.PROCUREMENT[i]));
});

// ── The stored values, which must NOT follow a rename ────────────────────────

test('the stored stage keys are unchanged by the 2026-09-07 relabel', () => {
  assert.deepEqual(STAGE_KEYS.filter(k => k !== 'PROPOSAL_SENT'), [
    'QUALIFIED', 'PRECONSTRUCTION', 'BUYOUT', 'CONSTRUCTION', 'COMPLETED',
  ]);
});

test('the renamed stages kept their old keys', () => {
  assert.equal(STAGE_LABEL.PRECONSTRUCTION, 'Design / Pre-Con');
  assert.equal(STAGE_LABEL.CONSTRUCTION,    'CA / Procurement');
});

test('a new project starts in Qualified on both boards', () => {
  assert.equal(DEFAULT_STAGE.PROCUREMENT, 'QUALIFIED');
  assert.equal(DEFAULT_STAGE.DESIGN,      'QUALIFIED');
  assert.ok(STAGE_KEYS.includes(DEFAULT_STAGE.PROCUREMENT));
  assert.ok(STAGE_KEYS.includes(DEFAULT_STAGE.DESIGN));
});

// ── Old design-board values still read correctly ─────────────────────────────

test('every legacy design key still maps onto a real stage', () => {
  for (const [legacy, shared] of Object.entries(LEGACY_DESIGN_STAGE)) {
    assert.ok(STAGE_KEYS.includes(shared), `${legacy} maps to a stage that exists`);
    assert.equal(normalizeStage(legacy), shared);
  }
});

test('a legacy value renders a label rather than a raw key', () => {
  // A row that never got migrated must not show "CONSTRUCTION_ADMIN" on screen.
  assert.equal(STAGE_LABEL.CONSTRUCTION_ADMIN, 'CA / Procurement');
  assert.equal(STAGE_LABEL.DESIGN,             'Design / Pre-Con');
  // PROPOSAL_SENT is a live Design-board key again since 10-5, so it reads as itself.
  assert.equal(STAGE_LABEL.PROPOSAL_SENT,      'Proposal Sent');
});

test('an unknown stage normalizes to null instead of guessing', () => {
  assert.equal(normalizeStage('SOMETHING_ELSE'), null);
  assert.equal(normalizeStage(null), null);
  assert.equal(normalizeStage(''), null);
});

// ── The out-of-sync badge still behaves after the relabel ────────────────────

test('a dual-pipeline job is in sync when both boards sit in the same stage', () => {
  assert.equal(stagesOutOfSync({
    serviceType: 'fullDesign', procurementStage: 'BUYOUT', designStage: 'BUYOUT',
  }), false);
});

test('a legacy design value does not false-flag as out of sync', () => {
  // CONSTRUCTION_ADMIN normalizes to CONSTRUCTION, so these two agree.
  assert.equal(stagesOutOfSync({
    serviceType: 'fullDesign', procurementStage: 'CONSTRUCTION', designStage: 'CONSTRUCTION_ADMIN',
  }), false);
});

test('genuinely different stages still flag', () => {
  assert.equal(stagesOutOfSync({
    serviceType: 'fullDesign', procurementStage: 'BUYOUT', designStage: 'COMPLETED',
  }), true);
});

test('a procurement-only job is never out of sync', () => {
  assert.equal(stagesOutOfSync({
    serviceType: 'bidOnly', procurementStage: 'BUYOUT', designStage: 'COMPLETED',
  }), false);
});
