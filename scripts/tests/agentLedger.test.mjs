// The ledger writes to two sinks with two different shapes, and nothing forced
// them to agree.
//
// Found in production 2026-08-25, in the dev log of a live intake parse:
//
//   [agent/ledger] failed to record a run, the call itself still happened:
//   Invalid `prisma.agentRun.create()` invocation:
//     { at, task, model, status, durationMs, ... + taskType: String }
//     Argument `taskType` is missing.
//
// The entry object used the JSONL names (task / durationMs / at / error); the
// table uses the review layer's names (taskType / latencyMs / createdAt /
// errorMessage). recordRun swallows its own failures BY DESIGN, a ledger must
// never take down the feature it observes, so this never surfaced as an error
// anywhere a test or a user would see. The dev JSONL sink looked perfectly
// healthy the whole time, because the JSONL sink was the shape that matched.
//
// So the test cannot be "does recordRun throw". It has to be "does the object
// handed to prisma actually fit the table", checked against the real schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { recordRun, _setPrismaForTests } from '../../src/lib/agent/ledger.js';

/** Field names declared on a model in schema.prisma, the source of truth. */
function schemaFields(model) {
  const schema = readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
  const body = schema.match(new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1];
  assert.ok(body, `model ${model} not found in schema.prisma`);

  const fields = new Map(); // name -> { optional, hasDefault, relation }
  for (const line of body.split('\n')) {
    const m = line.trim().match(/^(\w+)\s+(\w+)(\?)?(\[\])?\s*(.*)$/);
    if (!m) continue;                          // blank, comment, @@index
    const [, name, , optional, list, rest] = m;
    if (rest.includes('@relation') || list) continue;   // relations aren't writable scalars
    fields.set(name, {
      optional:   Boolean(optional),
      hasDefault: rest.includes('@default') || rest.includes('@updatedAt'),
    });
  }
  return fields;
}

/** Capture the object recordRun hands to prisma, without a database. */
async function captured(run) {
  let data = null;
  _setPrismaForTests({ agentRun: { create: async (args) => { data = args.data; return {}; } } });
  await recordRun(run);
  _setPrismaForTests(null);
  return data;
}

const SAMPLE = {
  task: 'intake.unitMatrix.parse',
  model: 'claude-fable-5',
  status: 'ok',
  durationMs: 15737,
  inputTokens: 1200,
  outputTokens: 340,
  stopReason: 'end_turn',
  projectId: 'proj_1',
  userId: 'user_1',
};

test('every key the ledger writes is a real AgentRun column', async () => {
  const data = await captured(SAMPLE);
  assert.ok(data, 'recordRun never called agentRun.create');

  const fields = schemaFields('AgentRun');
  const unknown = Object.keys(data).filter(k => !fields.has(k));
  assert.deepStrictEqual(unknown, [],
    'the ledger is writing columns that do not exist, prisma rejects the whole row, ' +
    'and recordRun swallows the error, so the ledger records NOTHING');
});

test('every required AgentRun column is supplied', async () => {
  const data = await captured(SAMPLE);
  const fields = schemaFields('AgentRun');

  const missing = [...fields]
    .filter(([, f]) => !f.optional && !f.hasDefault)
    .map(([name]) => name)
    .filter(name => data[name] === undefined || data[name] === null);

  assert.deepStrictEqual(missing, [],
    'a required column has no value, this is the exact shape of the 2026-08-25 bug');
});

test('the run actually survives the trip: values land, not just keys', async () => {
  const data = await captured(SAMPLE);
  assert.equal(data.taskType, 'intake.unitMatrix.parse', 'task must become taskType');
  assert.equal(data.latencyMs, 15737, 'durationMs must become latencyMs');
  assert.equal(data.inputTokens, 1200);
  assert.equal(data.outputTokens, 340);
  assert.equal(data.projectId, 'proj_1');
});

test('a ledger row is an observation, not something queued for a human', async () => {
  // The review queue reads status=AWAITING_REVIEW. If plain ledger rows landed
  // there they would bury the proposals that genuinely need a person, and
  // PENDING would park them in a queue nobody is ever going to work.
  const ok = await captured(SAMPLE);
  assert.equal(ok.status, 'CLOSED');
  assert.equal(ok.reviewable, false);

  const bad = await captured({ ...SAMPLE, status: 'error', error: 'upstream 529' });
  assert.equal(bad.status, 'ERROR');
  assert.equal(bad.errorMessage, 'upstream 529', 'error must become errorMessage');
});

test('an error string is still truncated on the way to the table', async () => {
  // Unchanged from the JSONL sink, and it matters more here: an error can echo
  // the prompt back, and the prompt carries client names and buy prices.
  const data = await captured({ ...SAMPLE, status: 'error', error: 'x'.repeat(5000) });
  assert.ok(data.errorMessage.length <= 500,
    'an echoed prompt would become a second, unredacted copy of everything sensitive');
});

test('a failing ledger write never reaches the caller', async () => {
  // The property the whole file depends on. If this ever regresses, a database
  // hiccup starts taking down intake parses.
  _setPrismaForTests({ agentRun: { create: async () => { throw new Error('db down'); } } });
  await assert.doesNotReject(() => recordRun(SAMPLE));
  _setPrismaForTests(null);
});
