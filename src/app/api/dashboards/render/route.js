import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSectionRows } from '@/lib/dashboards/providers';
import { runFieldWidget } from '@/lib/dashboards/engine';
import { runWidget } from '@/lib/dashboardEngine';
import { dimensionsFor, readField } from '@/lib/dashboards/fieldCatalog';
import { loadSamplesWithContext } from '@/lib/calibration/capture';
import { loadFigureNorms, loadAdoptedGuesses } from '@/lib/calibration/figureNormsLoad';
import { runCalibrationWidget } from '@/lib/calibration/report';

function parseSpec(ds) {
  if (ds == null) return {};
  if (typeof ds === 'string') { try { return JSON.parse(ds || '{}') || {}; } catch { return {}; } }
  return typeof ds === 'object' ? ds : {};
}

// Distinct values per plain dimension → powers the global filter bar. Computed
// from the full (unfiltered) row set so options never vanish as filters narrow.
function computeFacets(rows, section) {
  const facets = {};
  for (const dim of dimensionsFor(section)) {
    if (dim.type !== 'dimension') continue; // skip dates & numeric buckets
    const vals = new Set();
    for (const row of rows) {
      const v = readField(row, dim.source);
      if (v != null && v !== '') vals.add(String(v));
    }
    facets[dim.key] = [...vals].sort().slice(0, 50);
  }
  return facets;
}

export const dynamic = 'force-dynamic';

// A field-picker spec always declares a groupBy or at least one measure term.
// Anything else (notably the seeded templates with dataSpec=null) is legacy.
function isEmptySpec(ds) {
  let s = ds;
  if (s == null) return true;
  if (typeof s === 'string') { try { s = JSON.parse(s || '{}'); } catch { return true; } }
  if (!s || typeof s !== 'object') return true;
  return !s.groupBy && !(Array.isArray(s.terms) && s.terms.length);
}

// Flatten the legacy runWidget() multi-segment output → the new Chart's
// [{label,value}] shape. CONVERSION collapses to win-rate %, everything else
// sums its numeric segment values (templates are single-segment).
function flattenLegacy(data) {
  const series = Array.isArray(data?.series) ? data.series : [];
  if (data?.category === 'CONVERSION') {
    return series.map(r => ({ label: String(r.label), value: Number(r.winRate) || 0 }));
  }
  const segs = (data?.segments && data.segments.length) ? data.segments : null;
  return series.map(r => {
    let v = 0;
    if (segs) for (const s of segs) v += Number(r[s]) || 0;
    else for (const [k, val] of Object.entries(r)) if (k !== 'label' && typeof val === 'number') v += val;
    return { label: String(r.label), value: v };
  });
}

// POST /api/dashboards/render
// Body: { section, filters?, widgets:[{ id, chartType, dataSpec }] }
// Returns: { results: { [widgetId]: { chartType, series:[{label,value}] } } }
// Compute stays server-side (raw rows never reach the client).
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { section = 'SALES', filters = [], widgets = [] } = await request.json().catch(() => ({}));
  let rows = [];
  try { rows = await getSectionRows(section); }
  catch (e) { console.error('[dashboards/render] provider error:', e?.message ?? e); }

  // Legacy template widgets have no field-picker dataSpec. Fetch their full rows
  // and render them through the original engine so seeded charts keep working
  // during the migration to the one field-picker engine.
  const maybeLegacyIds = widgets.filter(w => isEmptySpec(w.dataSpec) && w.id).map(w => w.id);
  const legacyRows = maybeLegacyIds.length
    ? await prisma.dashboardWidget.findMany({ where: { id: { in: maybeLegacyIds } } })
    : [];
  const legacyById = new Map(legacyRows.filter(w => w.category !== 'FIELD').map(w => [w.id, w]));

  // Calibration widgets read CalibrationSample rows, not the section rows.
  // Loaded once per request, only when a widget asks for them.
  const wantsCalibration = widgets.some(w => parseSpec(w.dataSpec).kind === 'calibration');
  let samples = [];
  if (wantsCalibration) {
    try { samples = await loadSamplesWithContext(); }
    catch (e) { console.error('[dashboards/render] calibration load error:', e?.message ?? e); }
  }
  // Both loaders are cached and never throw.
  let figures = {};
  if (widgets.some(w => ['learnedFigures', 'amenitySfByType'].includes(parseSpec(w.dataSpec).report))) {
    const [figureNorms, adopted] = await Promise.all([loadFigureNorms(), loadAdoptedGuesses()]);
    figures = { figureNorms, adopted };
  }

  const results = {};
  for (const w of widgets) {
    try {
      const spec = parseSpec(w.dataSpec);
      const lw = legacyById.get(w.id);
      if (spec.kind === 'verification') {
        // Things Needing a Look fetches itself from /api/verification — it has
        // to write (it stamps which items have been shown), which this route
        // does not do. Nothing to render here; the card takes over on screen.
        results[w.id] = { chartType: 'VERIFICATION', series: [] };
      } else if (spec.kind === 'desk') {
        // My Desk is per person; the card fetches /api/sales/desk itself.
        results[w.id] = { chartType: 'DESK', series: [] };
      } else if (spec.kind === 'calibration') {
        results[w.id] = runCalibrationWidget(spec, samples, filters, figures);
      } else if (lw) {
        const data = await runWidget(lw, prisma);
        results[w.id] = { chartType: lw.chartType || w.chartType || 'BAR', series: flattenLegacy(data), legacy: true };
      } else {
        results[w.id] = runFieldWidget(w, rows, section, filters);
      }
    } catch (e) {
      results[w.id] = { chartType: w.chartType || 'BAR', series: [], error: e?.message ?? String(e) };
    }
  }
  return NextResponse.json({ results, facets: computeFacets(rows, section) });
}
