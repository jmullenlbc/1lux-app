// Tests for src/lib/aiModels.js, the one table that decides which Claude model
// does which job (added 2026-08-19).
//
// These are guard-rails, not model reviews. They protect three things that broke
// silently before the table existed:
//   1. a typo'd job name landing on some default model instead of throwing,
//   2. `effort` being sent to Haiku 4.5, which rejects it with a 400, and
//   3. a whole category of work drifting onto the wrong tier unnoticed.
import { test } from 'node:test';
import assert from 'node:assert';
import { TIERS, JOB_TIERS, DRAWING_JOBS, modelFor, modelParams, textFrom, answerBudget,
         THINKING_HEADROOM, warnIfTruncated } from '../../src/lib/aiModels.js';

test('every job points at a tier that actually exists', () => {
  for (const [job, tier] of Object.entries(JOB_TIERS)) {
    assert.ok(TIERS[tier], `job "${job}" names tier "${tier}", which is not in TIERS`);
  }
});

test('an unknown job throws instead of guessing a model', () => {
  // The whole point of the table: a new feature that forgets to register its job
  // fails loudly in dev rather than quietly running on whatever the default was.
  assert.throws(() => modelFor('nope.notAJob'), /unknown job/);
  assert.throws(() => modelParams('schedule.constructionn'), /unknown job/);
});

test('modelParams sends effort only where the model supports it', () => {
  // Live-verified 2026-08-19: claude-haiku-4-5 + output_config.effort returns
  // 400 "This model does not support the effort parameter." So the QUICK tier
  // must never carry the field at all, not even set to null.
  for (const job of Object.keys(JOB_TIERS)) {
    const params = modelParams(job);
    const effort = TIERS[JOB_TIERS[job]].effort;
    assert.ok(params.model, `${job} produced no model`);
    if (effort) {
      assert.equal(params.output_config?.effort, effort, `${job} should carry effort`);
    } else {
      assert.ok(!('output_config' in params), `${job} must not carry output_config`);
    }
  }
});

test('modelParams.model always agrees with modelFor', () => {
  for (const job of Object.keys(JOB_TIERS)) {
    assert.equal(modelParams(job).model, modelFor(job));
  }
});

test('the heavy document reads sit on the deep-read tier', () => {
  // If one of these ever drifts down a tier, a 300k-character schedule or a
  // dense drawing set gets read by a smaller model and the budget goes wrong
  // without anything erroring. Named explicitly so the drift shows up here.
  const deep = ['schedule.construction', 'schedule.design', 'drawing.unitMatrix',
                'drawing.siteData', 'fixtureSchedule.parse', 'peerReview.parsePdf'];
  for (const job of deep) {
    assert.equal(JOB_TIERS[job], 'DEEP_READ', `${job} must stay on DEEP_READ`);
    assert.equal(modelFor(job), TIERS.DEEP_READ.model);
  }
});

test('the high-volume bot calls stay on the cheap tier', () => {
  // These run all day and a bigger model does not change the answer. Leaving
  // them here is what pays for the tiers above.
  for (const job of ['bot.activityClassify', 'bot.outreach.compose', 'bot.followUp',
                     'bot.noteActions', 'market.entityExtract']) {
    assert.equal(JOB_TIERS[job], 'QUICK', `${job} must stay on QUICK`);
  }
});

test('no two tiers resolve to the same model', () => {
  const models = Object.values(TIERS).map(t => t.model);
  assert.equal(new Set(models).size, models.length, 'two tiers resolve to the same model');
});

test('every tier says whether its model thinks', () => {
  for (const [name, tier] of Object.entries(TIERS)) {
    assert.equal(typeof tier.thinks, 'boolean', `tier ${name} is missing a thinks flag`);
  }
});

// ── answerBudget ────────────────────────────────────────────────────────────
// The bug this exists for: the Marmalade schedule read spent 3,417 of its 4,000
// output tokens thinking, ran out mid-JSON, and the app said "no milestones
// found" on a read that was going fine. Nothing errored.

test('answerBudget adds room to think on the thinking tiers', () => {
  assert.equal(answerBudget('schedule.construction', 4000), 4000 + THINKING_HEADROOM);
  assert.equal(answerBudget('contract.analyze', 16000),    16000 + THINKING_HEADROOM);
});

test('answerBudget passes straight through where nothing thinks', () => {
  assert.equal(answerBudget('bot.followUp', 400), 400);
  assert.equal(answerBudget('chat.project', 1024), 1024);
});

test('the headroom actually covers the failure that caused it', () => {
  // 3,417 thinking tokens is the measured number from the Marmalade read.
  assert.ok(THINKING_HEADROOM > 3417, 'headroom must exceed the observed thinking spend');
});

test('answerBudget refuses an unknown job too', () => {
  assert.throws(() => answerBudget('nope.notAJob', 100), /unknown job/);
});

test('the live chat jobs stay off the thinking tiers', () => {
  // Someone is watching these type. A model that thinks first shows them a
  // silent pause before the first word, which is a worse chat.
  for (const job of ['chat.project', 'chat.knowledgeBase']) {
    assert.equal(TIERS[JOB_TIERS[job]].thinks, false, `${job} must not sit on a thinking tier`);
  }
});

test('warnIfTruncated reports only a max_tokens stop', () => {
  assert.equal(warnIfTruncated({ stop_reason: 'end_turn' }, 'schedule.construction'), false);
  assert.equal(warnIfTruncated(null, 'schedule.construction'), false);
  assert.equal(warnIfTruncated({ stop_reason: 'max_tokens' }, 'schedule.construction'), true);
});

// ── textFrom ────────────────────────────────────────────────────────────────
// This is the guard for the bug that the tier change actually caused: the site
// plan read came back fine and the app reported "could not read the extraction
// result", because block 0 of a Fable/Opus reply is a thinking block, not text.

test('textFrom skips a leading thinking block', () => {
  const msg = { content: [{ type: 'thinking', thinking: 'weighing the site data block' },
                          { type: 'text', text: '{"totalUnits":240}' }] };
  assert.equal(textFrom(msg), '{"totalUnits":240}');
});

test('textFrom joins text split across blocks, and trims', () => {
  const msg = { content: [{ type: 'text', text: '  {"a":1,' }, { type: 'text', text: '"b":2}  ' }] };
  assert.equal(textFrom(msg), '{"a":1,"b":2}');
});

test('textFrom returns an empty string rather than throwing on junk', () => {
  assert.equal(textFrom(null), '');
  assert.equal(textFrom({}), '');
  assert.equal(textFrom({ content: [] }), '');
  assert.equal(textFrom({ content: [{ type: 'thinking', thinking: 'x' }] }), '');
});

test('textFrom ignores tool_use and other non-text blocks', () => {
  const msg = { content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} },
                          { type: 'text', text: 'answer' }] };
  assert.equal(textFrom(msg), 'answer');
});

// ─── the hard rule on drawing sets ──────────────────────────────────────────
//
// Mike, 2026-08-28: every PDF architectural or construction drawing set is read
// by Fable 5, with no exceptions for the small-looking jobs. These tests are the
// enforcement, the rule was previously a paragraph of prose, and under it two
// drawing jobs sat on the cheapest model for months because each one, on its
// own, looked too trivial to matter.

test('EVERY drawing job reads on Fable 5, no exceptions for the small ones', () => {
  for (const job of DRAWING_JOBS) {
    assert.equal(JOB_TIERS[job], 'DEEP_READ', `${job} reads a drawing set and must be DEEP_READ`);
    assert.equal(modelFor(job), 'claude-fable-5', `${job} must read on Fable 5`);
  }
});

test('every job on the drawing list is a real job', () => {
  // A typo here would pass the test above by testing nothing at all.
  for (const job of DRAWING_JOBS) {
    assert.ok(job in JOB_TIERS, `${job} is on the drawing list but not in JOB_TIERS`);
  }
});

test('a new drawing.* job cannot be added without facing the rule', () => {
  // The list is what the rule is enforced against, so a drawing job that never
  // makes it onto the list is invisible to all of this. Anything NAMED like a
  // drawing job has to be on it.
  const named = Object.keys(JOB_TIERS).filter(j => j.startsWith('drawing.'));
  for (const job of named) {
    assert.ok(DRAWING_JOBS.includes(job),
      `${job} looks like a drawing job, add it to DRAWING_JOBS or rename it`);
  }
});
