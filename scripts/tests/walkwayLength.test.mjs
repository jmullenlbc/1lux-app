// Mike 2026-10-02: "It should read it or estimate but not ask." The site read
// measures the walkway on a homes site plan; the takeoff records it and the
// estimate prices one bollard / pedestrian pole per 40 ft. Never a question.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_VISION_PROMPT_VERSION, SITE_VISION_SYSTEM } from '../../src/lib/siteVision.js';

test('the site read asks for the walkway length on homes only', () => {
  assert.match(SITE_VISION_PROMPT_VERSION, /2026-10-02c/);
  assert.match(SITE_VISION_SYSTEM, /walkwayLengthFtMeasured/);
  assert.match(SITE_VISION_SYSTEM, /TOWNHOME or SINGLE-FAMILY/);
});

import { computeQuantities } from '../../src/lib/intake/quantities.js';
import { computeIntakeEstimate } from '../../src/lib/intake/estimate.js';
import { mergeProposals } from '../../src/lib/mergeProposals.js';
import { SITE_NUMBER_KEYS } from '../../src/lib/intake/combineResult.js';

const TOWN = 'Town Houses (2-3 Levels)';
const drawings = siteData => ({ sources: ['site.pdf'], unitTypes: [], projectTotals: null, siteData: { confidence: 0.9, ...siteData } });
const rowsOf = (siteData, answers) => Object.fromEntries(computeQuantities(drawings(siteData), answers).map(r => [r.key, r]));

test('a measured walkway becomes a recorded row for homes, never for apartments', () => {
  const r = rowsOf({ totalUnits: 64, walkwayLengthFtMeasured: 800 }, { projectType: TOWN });
  assert.equal(r.walkwayLengthFt.value, 800);
  assert.equal(r.walkwayLengthFt.source, 'drawing');
  const g = rowsOf({ totalUnits: 200, walkwayLengthFtMeasured: 800 }, { projectType: 'Garden (3 Levels)' });
  assert.equal(g.walkwayLengthFt, undefined);
  assert.equal(rowsOf({ totalUnits: 64 }, { projectType: TOWN }).walkwayLengthFt, undefined, 'nothing read, no row');
});

test('the estimate prices one pole per 40 ft of the measured walkway', () => {
  const answers = { projectType: TOWN, pathwayBollards: 'Yes' };
  const { budget } = computeIntakeEstimate({ answers, drawings: drawings({ totalUnits: 64, walkwayLengthFtMeasured: 800 }) });
  assert.equal(budget.sections.exterior.pathway.poles, 20);
});

test('the walkway key survives combining and merging reads', () => {
  assert.ok(SITE_NUMBER_KEYS.includes('walkwayLengthFtMeasured'));
  const merged = mergeProposals([{ fileName: 'a.pdf', proposal: { kind: 'site_data', unitTypes: [], siteData: { walkwayLengthFtMeasured: 640 } } }]);
  assert.equal(merged.siteData.walkwayLengthFtMeasured, 640);
});
