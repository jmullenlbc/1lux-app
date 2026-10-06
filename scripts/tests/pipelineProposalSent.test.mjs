/**
 * Proposal Sent on the Design board (Mike, 2026-10-05).
 *
 * The Design board gets one column the Procurement board does not: Proposal
 * Sent, between Qualified and Design / Pre-Con. The key PROPOSAL_SENT used to be
 * a legacy value that read as Qualified; it is a live key again. These pin the
 * list shape, the key set the project PATCH accepts, and the out-of-sync rule.
 *
 * Run: node --test scripts/tests/pipelineProposalSent.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIPELINE_STAGES, STAGE_KEYS, STAGE_LABEL, LEGACY_DESIGN_STAGE,
  stageKeysFor, normalizeStage, stagesOutOfSync,
} from '../../src/lib/pipeline.js';

test('Design has Proposal Sent between Qualified and Design / Pre-Con', () => {
  const keys = PIPELINE_STAGES.DESIGN.map(s => s.key);
  const i = keys.indexOf('PROPOSAL_SENT');
  assert.ok(i > 0, 'Proposal Sent is on the Design board');
  assert.equal(keys[i - 1], 'QUALIFIED');
  assert.equal(keys[i + 1], 'PRECONSTRUCTION');
  assert.equal(STAGE_LABEL.PROPOSAL_SENT, 'Proposal Sent');
});

test('Procurement does not have Proposal Sent', () => {
  assert.ok(!PIPELINE_STAGES.PROCUREMENT.some(s => s.key === 'PROPOSAL_SENT'));
  assert.ok(!stageKeysFor('PROCUREMENT').includes('PROPOSAL_SENT'));
  assert.ok(stageKeysFor('DESIGN').includes('PROPOSAL_SENT'));
});

test('STAGE_KEYS is the union of both boards, so the project PATCH accepts it', () => {
  assert.ok(STAGE_KEYS.includes('PROPOSAL_SENT'));
  for (const k of stageKeysFor('PROCUREMENT')) assert.ok(STAGE_KEYS.includes(k));
  for (const k of stageKeysFor('DESIGN'))      assert.ok(STAGE_KEYS.includes(k));
});

test('normalizeStage keeps PROPOSAL_SENT as itself, and it is no longer a legacy key', () => {
  assert.equal(normalizeStage('PROPOSAL_SENT'), 'PROPOSAL_SENT');
  assert.ok(!('PROPOSAL_SENT' in LEGACY_DESIGN_STAGE));
});

test('Proposal Sent on Design is in sync with Qualified or Pre-Con on Procurement', () => {
  assert.equal(stagesOutOfSync({ serviceType: 'fullDesign', designStage: 'PROPOSAL_SENT', procurementStage: 'QUALIFIED' }), false);
  assert.equal(stagesOutOfSync({ serviceType: 'fullDesign', designStage: 'PROPOSAL_SENT', procurementStage: 'PRECONSTRUCTION' }), false);
  assert.equal(stagesOutOfSync({ serviceType: 'fullDesign', designStage: 'PROPOSAL_SENT', procurementStage: 'BUYOUT' }), true);
});
