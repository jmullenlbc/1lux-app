/**
 * The public conceptual-budget PDF (beta prep, 2026-09-12).
 *
 * Two promises pinned here:
 *   1. The PDF prices from the same function as the live estimate
 *      (computeIntakeEstimate), from the visitor's inputs — never from a
 *      number the browser sends.
 *   2. The PDF shows nothing the on-screen summary doesn't. "DN / buy price
 *      is never shown to contractors — not in PDFs", and marginPct is
 *      internal only. Internal fields planted on the budget must not surface.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeIntakeEstimate, intakeEstimateGate } from '../../src/lib/intake/estimate.js';
import {
  buildIntakePdfHtml, intakePdfFilename, intakeProjectDataRows,
  INTAKE_PDF_DISCLAIMER, INTAKE_PDF_CONTACT,
} from '../../src/lib/intake/pdfHtml.js';
import { ILC_ONLY_FIELDS } from '../../src/lib/redact.js';
import { formatCurrency } from '../../src/lib/format.js';

const GARDEN = 'Garden (3 Levels)';
const TYPED = {
  noDrawings: 'yes', projectType: GARDEN,
  figureTotalUnits: '200', figureGrossSf: '250000', figureStories: '3', figureSurfaceParking: '300',
};

const estimate = () => computeIntakeEstimate({ answers: { ...TYPED }, drawings: null });

const render = (budget, extra = {}) => buildIntakePdfHtml({
  projectName: 'Lincoln Avenue Phase 2',
  location: 'Austin, TX 78701',
  buildingType: GARDEN,
  budget,
  projectData: estimate().projectData,
  dateLabel: 'September 12, 2026',
  ...extra,
});

/** What a reader of the PDF actually sees — styles and tags gone. */
const visibleText = html => html
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ');

test('the gate: nothing is priced without drawings or the typed-in minimum', () => {
  assert.equal(intakeEstimateGate({}, null).ready, false);
  assert.deepEqual(computeIntakeEstimate({ answers: {}, drawings: null }), { budget: null, projectData: null, quantities: [] });
  assert.equal(intakeEstimateGate({ noDrawings: 'yes', projectType: GARDEN }, null).ready, false, 'minimum not met');
  assert.equal(intakeEstimateGate(TYPED, null).ready, true);
  // Drawings sent alongside "no drawings" are ignored.
  assert.equal(intakeEstimateGate(TYPED, { sources: [] }).hasDrawings, false);
  assert.equal(intakeEstimateGate({}, { sources: [] }).hasDrawings, true);
});

test('a typed-in garden job prices, and the same inputs price the same every time', () => {
  const a = estimate();
  const b = estimate();
  assert.ok(a.budget.totalWithControls > 0);
  assert.equal(a.projectData.grossSf, 250000);
  assert.equal(a.projectData.numUnits, 200);
  assert.equal(a.projectData.buildingTypeKey, 'garden');
  assert.deepEqual(a, b);
});

test('the PDF carries the summary figures exactly as the screen formats them', () => {
  const { budget } = estimate();
  const text = visibleText(render(budget));
  for (const n of [budget.totalWithControls, budget.subtotalLightingOnly, budget.controlsTotal,
                   budget.lightingProductSubtotal, budget.freight, budget.controlsFreight]) {
    assert.ok(text.includes(formatCurrency(n)), `missing ${formatCurrency(n)}`);
  }
  for (const label of ['Residential Units', 'Corridors & Stairwells', 'Exit Signs', 'Lighting Subtotal',
                       'Lighting Total', 'Controls (IECC)', 'Total w/ Controls', 'Controls (w/ F&W)']) {
    assert.ok(text.includes(label), label);
  }
  assert.ok(text.includes(`$/SF: $${budget.perSf.toFixed(2)}`));
  for (const s of ['Lincoln Avenue Phase 2', 'Austin, TX 78701', GARDEN, 'September 12, 2026',
                   INTAKE_PDF_DISCLAIMER, INTAKE_PDF_CONTACT, 'Total Gross SF', '250,000']) {
    assert.ok(text.includes(s), s);
  }
  // No tax at intake, and no contingency picked — so no such rows.
  assert.ok(text.includes('Does not include sales tax.'));
  assert.ok(!text.includes('Sales Tax ('));
  assert.ok(!text.includes('Contingency'));
});

test('no DN, buy, margin or cost field ever reaches the PDF', () => {
  const { budget } = estimate();
  const SENTINEL = 97531.86;
  // Plant every ILC-only field name, plus the obvious ones, at the top and
  // nested inside a section — the builder must not pick any of them up.
  const plant = { dn: SENTINEL, DN: SENTINEL, buyPrice: SENTINEL, buy: SENTINEL, cost: SENTINEL,
                  unitCost: SENTINEL, marginPct: 0.4321, margin: SENTINEL };
  for (const name of ILC_ONLY_FIELDS) plant[name] = SENTINEL;
  const doped = structuredClone(budget);
  Object.assign(doped, plant);
  doped.sections = { ...doped.sections, units: { ...doped.sections.units, ...plant } };
  doped.sections.exterior = {
    ...doped.sections.exterior,
    wallpacks: { ...(doped.sections.exterior?.wallpacks || {}), each: SENTINEL },
    pathway:   { ...(doped.sections.exterior?.pathway || {}), rate: SENTINEL },
  };

  const html = render(doped);
  const text = visibleText(html);

  // The planted values never appear, in any format.
  for (const s of ['97531', '97,531', '0.4321', '43.21']) assert.ok(!html.includes(s), `leaked ${s}`);
  // No internal field name in the markup at all.
  for (const name of ILC_ONLY_FIELDS) assert.ok(!new RegExp(`\\b${name}\\b`).test(html), `field name ${name}`);
  // And none of the words, anywhere a reader can see.
  assert.doesNotMatch(text, /\bDN\b/);
  assert.doesNotMatch(text, /\bbuy/i);
  assert.doesNotMatch(text, /margin/i);
  assert.doesNotMatch(text, /\bcost/i);
  // Doping changed nothing a reader sees.
  assert.equal(text, visibleText(render(budget)));
});

test('the pricing model never ships to the public page', () => {
  // IntakeClient is a client component — it must reach prices only through
  // /api/intake/*. pdfHtml stays free of the engine too.
  const client = fs.readFileSync(new URL('../../src/app/conceptual_budget/IntakeClient.jsx', import.meta.url), 'utf8');
  for (const mod of ['lib/calculations', 'lib/pricing', 'lib/pricingLoader', 'intake/estimate', 'intake/pdfHtml',
                     'intake/noDrawingGuesses', 'intake/quantities']) {
    assert.ok(!new RegExp(`from '[^']*${mod}'`).test(client), `IntakeClient imports ${mod}`);
  }
  const builder = fs.readFileSync(new URL('../../src/lib/intake/pdfHtml.js', import.meta.url), 'utf8');
  const imports = [...builder.matchAll(/^import .* from '([^']+)';/gm)].map(m => m[1]).sort();
  assert.deepEqual(imports, ['../format.js', './questionnaire.js']);
});

test('the project name is escaped — the PDF renderer is a real browser on our server', () => {
  const { budget } = estimate();
  const html = render(budget, { projectName: '<img src="http://169.254.169.254/latest">Tower' });
  assert.ok(!html.includes('<img src="http://169'));
  assert.ok(html.includes('&lt;img src=&quot;http://169.254.169.254/latest&quot;&gt;Tower'));
});

test('a building type that is not one of the options is dropped', () => {
  const { budget } = estimate();
  assert.ok(!render(budget, { buildingType: 'Castle' }).includes('Castle'));
  assert.ok(!render(budget, { buildingType: 'Castle' }).includes('Building type'));
});

test('filename: ILC-Conceptual-Budget-<project-name>.pdf, safe for a header', () => {
  assert.equal(intakePdfFilename('Lincoln Avenue Phase 2'), 'ILC-Conceptual-Budget-Lincoln-Avenue-Phase-2.pdf');
  assert.equal(intakePdfFilename('Ave. #2 / "Tower"'), 'ILC-Conceptual-Budget-Ave-2-Tower.pdf');
  assert.equal(intakePdfFilename('Café Olé'), 'ILC-Conceptual-Budget-Cafe-Ole.pdf');
  assert.equal(intakePdfFilename(''), 'ILC-Conceptual-Budget-Project.pdf');
  assert.equal(intakePdfFilename('***'), 'ILC-Conceptual-Budget-Project.pdf');
  assert.ok(intakePdfFilename('x'.repeat(500)).length <= 'ILC-Conceptual-Budget-.pdf'.length + 80);
});

test('Project Data rows match the review step: same labels and order, blanks dropped', () => {
  const rows = intakeProjectDataRows({ grossSf: 250000, numUnits: 200, numEgressStairwells: 15, numSurfaceParking: 1200, garageSf: 0, bohSf: null });
  assert.deepEqual(rows, [
    { label: 'Total Gross SF',         value: '250,000' },
    { label: '# of Units',             value: '200' },
    { label: 'Stairwell Landings',     value: '15' },
    { label: 'Surface Parking Stalls', value: '1200' },
  ]);
});
