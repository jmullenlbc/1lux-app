/**
 * calibration/report.js — from samples to what the dashboard shows.
 *
 * Pure (no database). Input is CalibrationSample rows joined with a little
 * project context ({ projectName, clientName, serviceType, buildingType }).
 * Output is what a widget renders: a TABLE payload for the rate-drift report,
 * or the usual [{label, value}] series for the bar/line views.
 *
 * Drift is always (actual − model) ÷ model: positive means the engine is
 * pricing LOW against reality, negative means it is pricing HIGH.
 */
import { LINE_LABELS, LINE_KEYS } from './lines.js';
import { driverAnalysis, betterDriverSuggestions, describeSpread, describeSuggestion } from './drivers.js';

/** |drift| beyond this, with at least MIN_SAMPLES actuals, flags the line. */
export const DRIFT_REVIEW_PCT = 15;
export const MIN_SAMPLES      = 3;

const n = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
const pct = (actual, model) => (model > 0 ? Math.round(((actual - model) / model) * 1000) / 10 : null);
const round4 = (v) => (v == null ? null : Math.round(v * 10000) / 10000);

/** Only rows that carry an actual can teach anything. */
export function withActuals(samples) {
  return (samples || []).filter(s => s && s.actualAmount != null && s.actualAmount > 0);
}

/**
 * Apply the dashboard's global filters to samples. The filter bar speaks the
 * Pre-Con field catalog's dimension keys; the ones that mean something for a
 * sample are client, serviceType, projectType and buildingType.
 */
export function applySampleFilters(samples, filters = []) {
  const map = { client: 'clientName', serviceType: 'serviceType', projectType: 'projectType', buildingType: 'buildingType' };
  let rows = samples || [];
  for (const f of filters || []) {
    const field = map[f?.field];
    if (!field || f.value == null || f.value === '') continue;
    rows = rows.filter(r => String(r[field] ?? '') === String(f.value));
  }
  return rows;
}

/**
 * Rate-drift report, one row per budget line.
 * Each row also carries `details` (one per project sample) so the table can
 * expand, and `suggestedRate` + `pricingKey` so an admin can apply it.
 */
export function rateDriftReport(samples) {
  const rows = withActuals(samples);
  const byLine = new Map();
  for (const s of rows) {
    if (!byLine.has(s.lineKey)) byLine.set(s.lineKey, []);
    byLine.get(s.lineKey).push(s);
  }

  const out = [];
  for (const lineKey of [...LINE_KEYS, ...[...byLine.keys()].filter(k => !LINE_KEYS.includes(k))]) {
    const group = byLine.get(lineKey);
    if (!group?.length) continue;
    const modelSum  = group.reduce((a, s) => a + n(s.modelAmount), 0);
    const actualSum = group.reduce((a, s) => a + n(s.actualAmount), 0);
    const withQty   = group.filter(s => s.quantity > 0 && s.rateUsed != null);
    const qtySum    = withQty.reduce((a, s) => a + n(s.quantity), 0);
    const rateUsed  = withQty.length ? round4(withQty.reduce((a, s) => a + n(s.rateUsed) * n(s.quantity), 0) / qtySum) : null;
    const implied   = withQty.length ? round4(withQty.reduce((a, s) => a + n(s.actualAmount), 0) / qtySum) : null;
    const driftPct  = pct(actualSum, modelSum);
    const projects  = new Set(group.map(s => s.projectId)).size;
    const pricingKey = group.find(s => s.pricingKey)?.pricingKey ?? null;
    const flag = driftPct != null && Math.abs(driftPct) >= DRIFT_REVIEW_PCT
      ? (projects >= MIN_SAMPLES ? 'review' : 'watch')
      : 'ok';

    out.push({
      lineKey,
      label:        LINE_LABELS[lineKey] || lineKey,
      projects,
      samples:      group.length,
      modelSum:     Math.round(modelSum),
      actualSum:    Math.round(actualSum),
      driftPct,
      rateUsed,
      impliedRate:  implied,
      // A suggested rate only makes sense when the line IS rate × quantity.
      suggestedRate: rateUsed != null && implied != null && modelSum > 0 ? implied : null,
      pricingKey:   pricingKey && rateUsed != null ? pricingKey : null,
      quantityUnit: withQty[0]?.quantityUnit ?? null,
      flag,
      details: group
        .map(s => ({
          projectId:    s.projectId,
          projectName:  s.projectName || s.projectId,
          buildingType: s.buildingType || null,
          quantity:     s.quantity ?? null,
          quantityUnit: s.quantityUnit ?? null,
          modelAmount:  Math.round(n(s.modelAmount)),
          actualAmount: Math.round(n(s.actualAmount)),
          driftPct:     pct(n(s.actualAmount), n(s.modelAmount)),
          rateUsed:     s.rateUsed ?? null,
          impliedRate:  s.impliedRate ?? null,
          source:       s.source,
          note:         s.note || null,
          capturedAt:   s.capturedAt || null,
        }))
        .sort((a, b) => Math.abs(b.driftPct ?? 0) - Math.abs(a.driftPct ?? 0)),
    });
  }
  // Worst drift first — that is the row Mike opens the page for.
  return out.sort((a, b) => Math.abs(b.driftPct ?? 0) - Math.abs(a.driftPct ?? 0));
}

/** Drift per building type (all lines with actuals pooled). */
export function driftByBuildingType(samples) {
  const rows = withActuals(samples);
  const acc = {};
  for (const s of rows) {
    const k = s.buildingType || 'unknown';
    acc[k] ||= { model: 0, actual: 0 };
    acc[k].model  += n(s.modelAmount);
    acc[k].actual += n(s.actualAmount);
  }
  return Object.entries(acc)
    .map(([label, v]) => ({ label, value: pct(v.actual, v.model) ?? 0 }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/** Distinct projects with at least one actual, by capture month. */
export function samplesByMonth(samples) {
  const rows = withActuals(samples);
  const acc = {};
  for (const s of rows) {
    const d = s.capturedAt ? new Date(s.capturedAt) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    acc[k] ||= new Set();
    acc[k].add(s.projectId);
  }
  return Object.keys(acc).sort().map(k => ({ label: k, value: acc[k].size }));
}

/** How many projects have an actual on each line — where the model is still blind. */
export function coverageByLine(samples) {
  const rows = withActuals(samples);
  const acc = {};
  for (const s of rows) { acc[s.lineKey] ||= new Set(); acc[s.lineKey].add(s.projectId); }
  return LINE_KEYS
    .filter(k => k !== 'exterior.parkingEntrances')
    .map(k => ({ label: LINE_LABELS[k] || k, value: acc[k]?.size || 0 }));
}

export const CALIBRATION_REPORTS = {
  rateDrift:               { label: 'Rate drift by line (table)',        chartType: 'TABLE', unit: null },
  modelVsActualByLine:     { label: 'Model vs actual — drift % by line', chartType: 'BAR',   unit: '%'  },
  modelVsActualByBuilding: { label: 'Drift % by building type',          chartType: 'BAR',   unit: '%'  },
  samplesByMonth:          { label: 'Projects with actuals, by month',   chartType: 'LINE',  unit: null },
  coverageByLine:          { label: 'Projects with an actual, per line', chartType: 'BAR',   unit: null },
  driverFit:               { label: 'What each line really tracks',      chartType: 'TABLE', unit: null },
  driverSuggestions:       { label: 'Lines priced off the wrong thing',  chartType: 'TABLE', unit: null },
};

/**
 * Run one calibration widget. `spec` is the widget's dataSpec
 * ({ kind:'calibration', report }). Returns the render-route result shape.
 */
export function runCalibrationWidget(spec, samples, filters = []) {
  const report = spec?.report || 'rateDrift';
  const def = CALIBRATION_REPORTS[report];
  if (!def) return { chartType: 'BAR', series: [], error: `Unknown calibration report: ${report}` };
  const rows = applySampleFilters(samples, filters);

  if (report === 'rateDrift') {
    const table = rateDriftReport(rows);
    return {
      chartType: 'TABLE',
      series: table.map(r => ({ label: r.label, value: r.driftPct ?? 0 })),
      table: {
        kind: 'drift',
        columns: [
          { key: 'label',         label: 'Budget line' },
          { key: 'projects',      label: 'Projects' },
          { key: 'modelSum',      label: 'Model $',   unit: '$' },
          { key: 'actualSum',     label: 'Actual $',  unit: '$' },
          { key: 'driftPct',      label: 'Drift',     unit: '%' },
          { key: 'rateUsed',      label: 'Rate used', unit: 'rate' },
          { key: 'suggestedRate', label: 'Suggested', unit: 'rate' },
        ],
        rows: table,
        empty: 'No actuals yet — enter a hand-built figure on a project (pathway, entrances) or record an actual, and this table fills itself in.',
      },
    };
  }
  if (report === 'modelVsActualByLine') {
    return { chartType: 'BAR', series: rateDriftReport(rows).map(r => ({ label: r.label, value: r.driftPct ?? 0 })) };
  }
  if (report === 'modelVsActualByBuilding') return { chartType: 'BAR',  series: driftByBuildingType(rows) };
  if (report === 'samplesByMonth')          return { chartType: 'LINE', series: samplesByMonth(rows) };
  if (report === 'coverageByLine')          return { chartType: 'BAR',  series: coverageByLine(rows) };

  // Phase 3. These two ask a different question from everything above: not
  // "is the rate right" but "are we multiplying by the right thing at all".
  if (report === 'driverFit') {
    const table = driverAnalysis(rows).map(line => {
      const best = line.candidates[0] || null;
      return {
        label:     line.label,
        projects:  line.projects,
        current:   line.current?.driverLabel || 'Hand-entered',
        steadiness: describeSpread(line.current?.spread),
        best:      best?.driverLabel || '—',
        bestRate:  best?.impliedRate ?? null,
        // The renderer reads bestUnit to print "$12/SF" instead of a bare number.
        bestUnit:  best?.driverUnit || null,
        bestSteadiness: describeSpread(best?.spread),
      };
    });
    return {
      chartType: 'TABLE',
      series: table.map(r => ({ label: r.label, value: r.projects })),
      table: {
        kind: 'plain',
        columns: [
          { key: 'label',          label: 'Budget line' },
          { key: 'projects',       label: 'Jobs' },
          { key: 'current',        label: 'Priced off' },
          { key: 'steadiness',     label: 'How steady' },
          { key: 'best',           label: 'Best match' },
          { key: 'bestRate',       label: 'Its rate', unit: 'rate' },
          { key: 'bestSteadiness', label: 'How steady' },
        ],
        rows: table,
        empty: 'Not enough jobs with real figures yet. A line needs five before this will say anything about it.',
      },
    };
  }
  if (report === 'driverSuggestions') {
    const analysis = driverAnalysis(rows);
    const found    = betterDriverSuggestions(analysis);
    const table = found.map(s2 => ({
      label:    s2.label,
      projects: s2.projects,
      from:     s2.from ? `per ${s2.from.unit}` : 'hand-entered',
      to:       s2.to.driver,
      finding:  describeSuggestion(s2),
    }));
    return {
      chartType: 'TABLE',
      series: table.map(r => ({ label: r.label, value: r.projects })),
      table: {
        kind: 'plain',
        columns: [
          { key: 'label',    label: 'Budget line' },
          { key: 'projects', label: 'Jobs' },
          { key: 'from',     label: 'Priced off' },
          { key: 'to',       label: 'Really tracks' },
          { key: 'finding',  label: 'What that means' },
        ],
        rows: table,
        // "Nothing wrong" and "nothing to go on" look identical on screen and
        // mean opposite things, so the card says which one it is.
        empty: analysis.length
          ? 'Nothing to report — every line with enough jobs behind it is already priced off the thing it actually follows.'
          : 'Not enough jobs with real figures yet. A line needs five before this will say anything about it.',
      },
    };
  }

  return { chartType: def.chartType, series: [] };
}
