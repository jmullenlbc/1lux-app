/**
 * The downloadable conceptual-budget PDF for the public /conceptual_budget
 * page, HTML only; /api/intake/pdf hands it to htmlToPdf().
 *
 * THE RULE: this page shows nothing the on-screen review summary doesn't
 * already show the visitor. Every number is read BY NAME from the budget
 * object, the same hero figures, Project Data rows and Budget Breakdown
 * lines as IntakeClient's review step and SummaryBudgetBreakdown (minus the
 * hover details). The budget is never walked or spread, so whatever else the
 * engine adds to it later (wallpack unit prices, pathway rates, caps) can
 * never reach the PDF by accident. No DN / buy price, no margin, no cost.
 *
 * Styled after the staff PDF at src/app/api/projects/[id]/budget/pdf/route.js.
 * Pure (format.js has no imports), so scripts/tests/intakePdf.test.mjs can
 * render it without a browser.
 */
import { formatCurrency } from '../format.js';
import { INTAKE_QUESTIONS, designChoices } from './questionnaire.js';
import { controlsMathWords } from './controlsWords.js';

export const INTAKE_PDF_DISCLAIMER = 'Conceptual estimate, for budgeting only, not a quote.';
// The same wording the public page's footer uses.
const REVIEW_NOTE = 'An ILC Studios team member reviews every submission before a budget is issued.';
// The one address every public screen gives out (Mike 2026-09-12: precon@, not budgets@).
export const INTAKE_PDF_CONTACT = 'Questions? Email precon@ilcstudios.com';

const PROJECT_TYPES = INTAKE_QUESTIONS.find(q => q.key === 'projectType')?.options || [];

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const fmt = n => formatCurrency(Number(n) || 0);

/**
 * `ILC-Conceptual-Budget-<project-name>.pdf`, with the name cut down to
 * plain letters, digits and dashes so it is safe in a Content-Disposition
 * header and on every file system.
 */
export function intakePdfFilename(projectName) {
  const safe = String(projectName ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
  return `ILC-Conceptual-Budget-${safe || 'Project'}.pdf`;
}

/** The review step's Project Data rows, same labels, same order, blanks dropped. */
export function intakeProjectDataRows(pd = {}) {
  // The screen prints most figures with commas and four counts without: 
  // copied as-is so the two read identically.
  const n = v => (Number(v) > 0 ? Number(v).toLocaleString('en-US') : null);
  const c = v => (Number(v) > 0 ? String(Number(v)) : null);
  return [
    { label: 'Total Gross SF',         value: n(pd.grossSf) },
    { label: 'Units Gross SF',         value: n(pd.unitsSf) },
    { label: '# of Units',             value: n(pd.numUnits) },
    { label: '# of Bedrooms',          value: n(pd.numBedrooms) },
    { label: '# of Bathrooms',         value: n(pd.numBathrooms) },
    { label: '# of Vanities',          value: n(pd.numVanities) },
    { label: '# of Balconies',         value: n(pd.numBalconies) },
    { label: 'Stairwell Landings',     value: c(pd.numEgressStairwells) },
    { label: 'Corridor SF',            value: n(pd.corridorSf) },
    { label: 'Interior Amenity SF',    value: n(pd.interiorAmenitySf) },
    { label: 'Exterior Amenity SF',    value: n(pd.exteriorAmenitySf) },
    { label: 'Garage SF',              value: n(pd.garageSf) },
    { label: 'BOH SF',                 value: n(pd.bohSf) },
    { label: 'Surface Parking Stalls', value: c(pd.numSurfaceParking) },
    { label: '# of Carports',          value: c(pd.numCarports) },
    { label: '# of Exterior Doors',    value: c(pd.numExteriorDoors) },
  ].filter(r => r.value);
}

/**
 * @param {object} p
 * @param {string} p.projectName: the visitor's own project name
 * @param {string} p.location   : e.g. "Austin, TX 78701"
 * @param {string} [p.buildingType], a projectType option label; anything else is dropped
 * @param {object} p.budget     : calculateBudget() output, recomputed on the server
 * @param {object} p.projectData: the estimate's projectData
 * @param {string} p.dateLabel  : e.g. "September 12, 2026"
 * @param {object} [p.answers] : the visitor's questionnaire answers (printed as "Your design choices")
 */
export function buildIntakePdfHtml({ projectName, location, buildingType, budget, projectData, dateLabel, answers }) {
  if (!budget) throw new Error('buildIntakePdfHtml: no budget');
  const b = budget;
  const s = b.sections || {};
  const name = String(projectName ?? '').trim() || 'Your project';
  const typeLabel = PROJECT_TYPES.includes(buildingType) ? buildingType : null;

  const contingencyPct = b.contingencyRate ? Math.round(b.contingencyRate * 100) : 0;
  const ecPctLabel     = Math.round((b.energyCreditPct || 0) * 100);
  const taxLabel       = `Sales Tax (${Math.round((b.salesTaxPct || 0) * 10000) / 100}%)`;
  const hasTax         = b.lightingTaxAmount > 0 || b.controlsTaxAmount > 0;

  // SummaryBudgetBreakdown's eight visible lines, in its order.
  const lineItems = [
    { label: 'Residential Units',      value: s.units?.total?.product },
    { label: 'Corridors & Stairwells', value: s.corridors?.total?.product },
    { label: 'BOH / Core + Shell',     value: s.boh?.product },
    { label: 'Interior Amenities',     value: s.interior?.product },
    { label: 'Enclosed Garage',        value: s.garage?.product },
    { label: 'Exterior & Site',        value: s.exterior?.total?.product },
    { label: 'Emergency Lighting',     value: s.emergency?.product },
    { label: 'Exit Signs',             value: s.exitSigns?.product },
  ];

  function row(label, value, bold = false) {
    const v = Number(value) || 0;
    const style = bold
      ? 'display:flex;justify-content:space-between;padding:3px 0;font-weight:700;border-top:2px solid #0f172a;margin-top:4px'
      : 'display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #e2e8f0;font-size:8.5pt';
    const valStyle = bold ? 'font-family:monospace' : `font-family:monospace;color:${v === 0 ? '#cbd5e1' : '#0f172a'}`;
    return `<div style="${style}"><span>${esc(label)}</span><span style="${valStyle}">${esc(fmt(v))}</span></div>`;
  }

  const solar = s.exterior?.solar;
  const solarNote = solar
    ? `<div style="margin:6px 0 2px 0;padding:5px 8px;border:1px solid #fcd34d;border-radius:4px;font-size:7.5pt;color:#92400e">
        <strong>Solar site lighting</strong>, area lighting priced at ${esc(solar.multiplier)}× conventional. ${esc(solar.note)}
      </div>`
    : '';

  const breakdown = [
    ...lineItems.map(i => row(i.label, i.value)),
    solarNote,
    b.energyCreditLighting > 0 ? row(`Energy Credit (${ecPctLabel}%)`, b.energyCreditLighting) : '',
    row('Lighting Subtotal', b.lightingProductSubtotal, true),
    row('Freight', b.freight),
    row('Warehousing', b.warehousing),
    b.lightingTaxAmount > 0 ? row(taxLabel, b.lightingTaxAmount) : '',
    row('Lighting Total', b.subtotalLightingOnly, true),
    row('Controls (IECC)', b.controls),
    b.energyCreditControls > 0 ? row(`Energy Credit (${ecPctLabel}%)`, b.energyCreditControls) : '',
    row('Freight', b.controlsFreight),
    row('Warehousing', b.controlsWarehousing),
    b.controlsTaxAmount > 0 ? row(taxLabel, b.controlsTaxAmount) : '',
    row('Total w/ Controls', b.totalWithControls, true),
    ...(b.contingencyAmount > 0
      ? [row(`Contingency (${contingencyPct}%)`, b.contingencyAmount), row('Total w/ Contingency', b.totalWithContingency, true)]
      : []),
  ].join('\n');

  const cell = (label, value) =>
    `<div><div style="font-size:7pt;color:#94a3b8">${esc(label)}</div><div style="font-size:8pt;font-weight:600;color:#0f172a">${esc(value)}</div></div>`;

  const projectGrid = [
    cell('Project', name),
    location ? cell('Location', location) : '',
    typeLabel ? cell('Building type', typeLabel) : '',
    cell('Date', dateLabel),
  ].join('');
  const pdGrid = intakeProjectDataRows(projectData || {}).map(r => cell(r.label, r.value)).join('');

  const ctrlWords = controlsMathWords(b.controlsMath);
  const ctrlNote = ctrlWords
    ? `<p style="font-size:7.5pt;color:#475569;margin-top:6px"><strong>Controls:</strong> ${esc(ctrlWords)}</p>`
    : '';
  const choices = designChoices(answers).map(c =>
    `<tr><td style="padding:2px 8px 2px 0;color:#64748b;white-space:nowrap;vertical-align:top">${esc(c.section)}</td><td style="padding:2px 8px 2px 0;vertical-align:top">${esc(c.question)}</td><td style="padding:2px 0;font-weight:600;vertical-align:top">${esc(c.answer)}</td></tr>`).join('');
  const choicesBlock = choices
    ? `<div style="margin-top:12px;page-break-inside:avoid">
  <div style="margin-bottom:4px;font-weight:700;font-size:8.5pt;color:#0f172a">Your design choices</div>
  <table style="width:100%;border-collapse:collapse;font-size:7.5pt">
    <tr style="text-align:left;color:#94a3b8;font-size:7pt"><th style="padding:2px 8px 2px 0">LOCATION</th><th style="padding:2px 8px 2px 0">QUESTION</th><th style="padding:2px 0">ANSWER</th></tr>
    ${choices}
  </table>
</div>`
    : '';

  const perSf   = Number(b.perSf) > 0 ? `<div><span style="color:#94a3b8">$/SF: </span><span style="font-weight:600">$${Number(b.perSf).toFixed(2)}</span></div>` : '';
  const perUnit = Number(b.perUnit) > 0 ? `<div><span style="color:#94a3b8">$/Unit: </span><span style="font-weight:600">${esc(fmt(b.perUnit))}</span></div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(`${name}, Conceptual Lighting Budget`)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, "Helvetica Neue", sans-serif; font-size: 9pt; color: #1e1e1e; background: white; }
    @page { size: letter; margin: 0.5in 0.6in; }
  </style>
</head>
<body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
  <img src="https://app.ilcstudios.com/ilc-studios-logo.jpg" alt="ILC Studios" style="height:36px"/>
  <div style="text-align:right;font-size:7.5pt;color:#64748b;line-height:1.6">
    ILC Studios, Conceptual Lighting &amp; Controls Budget<br/>
    ${esc(name)}${location ? ' · ' + esc(location) : ''}<br/>
    ${esc(dateLabel)}
  </div>
</div>

<!-- Hero, the review step's navy block -->
<div style="background:#0f172a;color:white;padding:18px 22px;border-radius:6px;margin-bottom:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
  <div style="font-size:7.5pt;color:#94a3b8;margin-bottom:4px">ILC Studios, Conceptual Lighting &amp; Controls Budget</div>
  <div style="font-size:22pt;font-weight:700;font-family:monospace;margin-bottom:6px">${esc(fmt(b.totalWithControls))}</div>
  <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:8pt">
    <div><span style="color:#94a3b8">Lighting Only: </span><span style="font-weight:600">${esc(fmt(b.subtotalLightingOnly))}</span></div>
    <div><span style="color:#94a3b8">Controls (w/ F&amp;W): </span><span style="font-weight:600">${esc(fmt(b.controlsTotal))}</span></div>
    ${perSf}
    ${perUnit}
  </div>
</div>

<div style="margin:10px 0 8px 0;padding:8px 10px;border:1px solid #cbd5e1;border-radius:4px;font-size:8pt;color:#334155">
  <strong>${esc(INTAKE_PDF_DISCLAIMER)}</strong>
  ${hasTax ? '' : 'Does not include sales tax.'} ${esc(REVIEW_NOTE)}
</div>

<!-- Project -->
<div style="margin:10px 0 8px 0">
  <div style="font-weight:700;font-size:8.5pt;color:#0f172a;margin-bottom:6px">Project</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px 16px">
    ${projectGrid}
  </div>
</div>

<!-- Project Data -->
${pdGrid ? `<div style="margin:10px 0 8px 0">
  <div style="font-weight:700;font-size:8.5pt;color:#0f172a;margin-bottom:6px">Project Data</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px 16px">
    ${pdGrid}
  </div>
</div>` : ''}

<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0"/>

<!-- Budget Breakdown, SummaryBudgetBreakdown's visible rows -->
<div style="margin-bottom:4px;font-weight:700;font-size:8.5pt;color:#0f172a">Budget Breakdown</div>
${breakdown}
${ctrlNote}
${choicesBlock}

<p style="font-size:8pt;color:#475569;margin-top:14px;padding-top:8px;border-top:1px solid #e2e8f0">
  ${esc(INTAKE_PDF_CONTACT)} · ILC Studios
</p>

</body>
</html>`;
}
