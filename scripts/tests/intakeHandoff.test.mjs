/**
 * Web budget request → project hand-off.
 *
 * Mike, 2026-09-16: "Anything that comes through the conceptual budget should
 * input into the project. Shouldn't those fields really be the same really?"
 *
 * The proof that they are the same: price the request the public way, write the
 * plan the way the route does, read it back the way the project page does, and
 * the internal engine lands on the SAME dollars the visitor was shown.
 *
 * Run: node --test scripts/tests/intakeHandoff.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planHandoff, drawingsFromSubmission } from '../../src/lib/intake/handoff.js';
import { computeIntakeEstimate } from '../../src/lib/intake/estimate.js';
import { INTAKE_QUESTIONS } from '../../src/lib/intake/questionnaire.js';
import { calculateBudget } from '../../src/lib/calculations.js';
import { responsesToSections, BUILDING_TYPES } from '../../src/lib/utils.js';

const ANSWERS = {
  noDrawings: 'yes',
  projectType: 'Garden (3 Levels)',
  figureTotalUnits: '200',
  figureGrossSf: '250000',
  figureStories: '3',
  figureSurfaceParking: '300',
  figureExteriorAmenitySf: '5000',
  figureDogParks: '1',
  figurePickleballCourts: '2',
  figureCourtyardFt: '90',
  undercabinet: '120v',
};

const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
function modelBody(name) {
  const at = schema.indexOf(`model ${name} {`);
  return schema.slice(at, schema.indexOf('\n}', at));
}

test('every figure the plan writes is a real ProjectData column', () => {
  const plan = planHandoff({ answers: ANSWERS, drawings: null });
  assert.equal(plan.ready, true);
  const body = modelBody('ProjectData');
  for (const col of Object.keys(plan.data)) {
    assert.match(body, new RegExp(`\\n\\s+${col}\\s+(Int|Float)\\?`), `${col} is not a ProjectData column`);
  }
  assert.equal(plan.data.numUnits, 200);
  assert.equal(plan.data.grossSf, 250000);
  assert.equal(plan.data.numSurfaceParking, 300);
  assert.equal(plan.data.numFloors, 3);
  assert.ok(!('buildingTypeKey' in plan.data) && !('siteFeatures' in plan.data));
});

test('whole-number columns get whole numbers, and nothing blank is written', () => {
  const plan = planHandoff({ answers: ANSWERS, drawings: null });
  for (const [col, v] of Object.entries(plan.data)) {
    assert.ok(Number.isFinite(v), `${col} is not a number`);
    if (col.startsWith('num')) assert.ok(Number.isInteger(v), `${col} should be whole`);
  }
  assert.ok(!('numFans' in plan.data) || plan.data.numFans > 0, '0 fans must not pin the engine');
});

test('site features become rows, marked typed or drawing', () => {
  const plan = planHandoff({ answers: ANSWERS, drawings: null });
  assert.deepEqual(plan.features.map(f => [f.type, f.count, f.lengthFt, f.source]).sort(), [
    ['courtyard', 1, 90, 'typed'],
    ['playground', 1, null, 'typed'], // dog park folds into playground (10-14)
    ['tennisCourt', 2, null, 'typed'], // pickleball folds into tennis (10-14)
  ]);
});

test('the building type lands as one of the project\'s own types — for every intake choice', () => {
  const q = INTAKE_QUESTIONS.find(x => x.engine?.target === 'buildingTypeKey');
  for (const option of q.options) {
    const plan = planHandoff({ answers: { ...ANSWERS, projectType: option, figureStories: '4' }, drawings: null });
    if (!plan.ready) continue;
    assert.ok(BUILDING_TYPES.some(t => t.value === plan.buildingTypeKey), `${option} → ${plan.buildingTypeKey}`);
  }
});

test('the project opens at the same dollars the visitor was shown', () => {
  for (const answers of [ANSWERS, { ...ANSWERS, projectType: 'Podium (3-8 Levels)', figureStories: '6', figureGarageSf: '60000' }]) {
    const shown = computeIntakeEstimate({ answers, drawings: null });
    const plan  = planHandoff({ answers, drawings: null });
    // Read back exactly as the project page does.
    const sections = responsesToSections(plan.responses.filter(r => r.section !== 'project-data'));
    const projectData = {
      ...plan.data,
      buildingTypeKey: plan.buildingTypeKey,
      siteFeatures: plan.features.map(({ type, count, lengthFt }) => ({ type, count, lengthFt })),
    };
    const internal = calculateBudget(projectData, sections, null);
    assert.equal(Math.round(internal.totalWithControls), Math.round(shown.budget.totalWithControls));
    assert.equal(Math.round(internal.lightingProductSubtotal), Math.round(shown.budget.lightingProductSubtotal));
    assert.equal(plan.total, shown.budget.totalWithControls);
  }
});

test('Project Data figures are mirrored to the wizard rows, answers are strings', () => {
  const plan = planHandoff({ answers: ANSWERS, drawings: null });
  const mirrored = plan.responses.filter(r => r.section === 'project-data');
  assert.ok(mirrored.some(r => r.questionKey === 'numUnits' && r.answerValue === '200'));
  assert.ok(!mirrored.some(r => r.questionKey === 'numFloors'), 'numFloors is not a wizard question');
  assert.ok(plan.responses.some(r => r.section === 'units' && r.questionKey === 'undercabinet' && r.answerValue === 'lineVoltage'));
  for (const r of plan.responses) assert.equal(typeof r.answerValue, 'string');
  const seen = new Set(plan.responses.map(r => `${r.section}|${r.questionKey}`));
  assert.equal(seen.size, plan.responses.length, 'one row per (section, key)');
});

test('stored answer rows (how the database holds them) plan the same as the plain map', () => {
  const rows = Object.entries(ANSWERS).map(([questionKey, answer]) => ({ section: 'x', questionKey, question: 'q', answer }));
  assert.deepEqual(planHandoff({ answers: rows, drawings: null }), planHandoff({ answers: ANSWERS, drawings: null }));
});

test('a request with nothing to price hands over nothing, and never throws', () => {
  const plan = planHandoff({ answers: {}, drawings: null });
  assert.equal(plan.ready, false);
  assert.deepEqual(plan.data, {});
  assert.equal(drawingsFromSubmission({ rawPayload: 'not json' }), null);
  assert.equal(drawingsFromSubmission({ rawPayload: '{"drawings":null}' }), null);
  assert.deepEqual(drawingsFromSubmission({ rawPayload: '{"drawings":{"pages":3}}' }), { pages: 3 });
  assert.equal(drawingsFromSubmission(null), null);
});

test('the route: hand-off can never block making the project, and uses no public projection', () => {
  const src = readFileSync(new URL('../../src/app/api/admin/intake/[id]/create-project/route.js', import.meta.url), 'utf8');
  assert.ok(src.includes('requireIntakeReviewer'), 'staff only');
  // 0117: the route calls projectFromSubmission, shared with "Different job" on My Desk.
  assert.ok(src.includes('projectFromSubmission('));
  const lib = readFileSync(new URL('../../src/lib/intake/conceptualProjects.js', import.meta.url), 'utf8');
  const fn = lib.slice(lib.indexOf('export async function projectFromSubmission'));
  assert.ok(fn.includes('planFromWeb(') && fn.includes('carryWebFigures('));
  assert.ok(fn.indexOf('makeConceptualProject(') < fn.indexOf('carryWebFigures('), 'project first, figures second');
  assert.ok(lib.includes('applyHandoff(') && lib.includes('planHandoff('));
  assert.ok(/catch \(e\) \{[^}]*non-fatal/.test(lib), 'a failed hand-off is swallowed');
});
