/* CLIQ layout rules: areas and drawn rows -> runs for the takeoff engine.
 * Pure functions. All lengths in feet. Light levels in footcandles (fc).
 *
 * The light estimate is the lumen method (average only): E = N × lumens × CU × LLF / area.
 * It is a sizing aid, not photometrics. CLIQ lumens are published for the Wide optic only.
 */
import { LUMENS, WATTS_BY_LEN, defaultCfg } from './engine.js';

export const LAYOUT_DEFAULTS = {
  workplaneFt: 2.5, endClearFt: 2, cu: 0.75, llf: 0.85, maxSpacingRatio: 1.3,
  leaderFt: 50, jumperFt: 10
};

export const FIXTURE_MODES = [
  ['oc', 'On-center spacing'], ['gap', 'Gap between fixtures'], ['continuous', 'Continuous row'], ['target', 'Hit a light level']
];
export const ROW_MODES = [['count', 'Number of rows'], ['spacing', 'Row spacing']];

export const fixLenFt = len => (String(len) === '24' ? 2 : 4);
const round1 = n => Math.round(n * 10) / 10;

export function newArea(i = 1, extra = {}) {
  return {
    id: 'a' + Math.random().toString(36).slice(2, 8), name: `Area ${i}`, source: 'rules',
    lengthFt: 120, widthFt: 40, mountFt: 14, rowAlong: 'length',
    rowMode: 'count', rows: 4, rowSpacingFt: 10,
    fixtureMode: 'oc', ocFt: 10, gapFt: 6, targetFc: 30,
    endClearFt: LAYOUT_DEFAULTS.endClearFt, emRows: 0,
    leaderFt: LAYOUT_DEFAULTS.leaderFt, jumperFt: LAYOUT_DEFAULTS.jumperFt,
    cu: LAYOUT_DEFAULTS.cu, llf: LAYOUT_DEFAULTS.llf,
    cfg: defaultCfg(),
    drawn: [],
    ...extra
  };
}

/* How many fixtures fit along one row, and the gap they leave. */
export function fillRow(rowFt, rule) {
  const fl = fixLenFt(rule.len), end = Math.max(0, +rule.endClearFt || 0);
  const usable = Math.max(0, +rowFt - 2 * end);
  if (usable < fl) return { fixtures: 0, gapFt: 0, continuity: 'spaced', usedFt: 0 };
  const mode = rule.fixtureMode;
  if (mode === 'continuous') { const n = Math.floor(usable / fl + 1e-9); return { fixtures: n, gapFt: 0, continuity: 'continuous', usedFt: n * fl }; }
  if (mode === 'count') {
    const n = Math.max(1, Math.min(Math.floor(usable / fl + 1e-9), Math.round(+rule.perRow || 1)));
    const gap = n > 1 ? (usable - n * fl) / (n - 1) : 0;
    return gap < 0.05 ? { fixtures: n, gapFt: 0, continuity: 'continuous', usedFt: n * fl } : { fixtures: n, gapFt: round1(gap), continuity: 'spaced', usedFt: usable };
  }
  if (mode === 'gap') {
    const g = Math.max(0, +rule.gapFt || 0);
    const n = Math.floor((usable + g) / (fl + g) + 1e-9);
    return { fixtures: n, gapFt: g, continuity: g > 0 ? 'spaced' : 'continuous', usedFt: n * fl + Math.max(0, n - 1) * g };
  }
  /* on-center */
  const S = Math.max(fl, +rule.ocFt || fl);
  const n = Math.floor((usable - fl) / S + 1e-9) + 1;
  const g = S - fl;
  return { fixtures: n, gapFt: round1(g), continuity: g > 0 ? 'spaced' : 'continuous', usedFt: (n - 1) * S + fl };
}

/* Fixture positions (centers, feet from the row start) for drawing. */
export function positions(rowFt, fill, len) {
  const fl = fixLenFt(len); const n = fill.fixtures; if (!n) return [];
  const start = (rowFt - fill.usedFt) / 2;
  const pitch = fill.continuity === 'continuous' ? fl : fl + fill.gapFt;
  return Array.from({ length: n }, (_, i) => start + fl / 2 + i * pitch);
}

function emIndexes(rows, emRows) {
  const k = Math.max(0, Math.min(rows, Math.round(+emRows || 0))); const out = new Set();
  for (let i = 0; i < k; i++) out.add(Math.min(rows - 1, Math.round((i + 0.5) * rows / k - 0.5)));
  return out;
}

export function lightEstimate(fixtures, cfg, areaSf, cu, llf) {
  const lm = cfg.optic === 'W' ? LUMENS[+cfg.watts] : null;
  if (!lm || !(areaSf > 0)) return null;
  return fixtures * lm * (+cu || LAYOUT_DEFAULTS.cu) * (+llf || LAYOUT_DEFAULTS.llf) / areaSf;
}

/* Lay out one area. Returns rows (with geometry), engine runs, stats and warnings. */
export function layoutArea(a) {
  const warnings = [], notes = [];
  const cfg = a.cfg || defaultCfg();
  if (!(WATTS_BY_LEN[cfg.len] || []).includes(+cfg.watts)) warnings.push(`${cfg.len}" fixtures come in ${(WATTS_BY_LEN[cfg.len] || []).join('W or ')}W.`);
  const rule = { len: cfg.len, fixtureMode: a.fixtureMode, ocFt: a.ocFt, gapFt: a.gapFt, endClearFt: a.endClearFt };
  let rows = [];
  let areaSf = null, spanFt = null, rowFt = null, rowSpacing = null;

  if (a.source === 'drawn') {
    const list = (a.drawn || []).filter(d => +d.lengthFt > 0);
    if (!list.length) warnings.push(`${a.name}: draw at least one row on the plan.`);
    areaSf = +a.areaSf > 0 ? +a.areaSf : null;
    let target = null;
    if (a.fixtureMode === 'target') {
      if (!areaSf) warnings.push(`${a.name}: enter the area (sq ft) to size fixtures to a light level.`);
      else target = targetCount(a, cfg, areaSf);
    }
    const totalLen = list.reduce((s, d) => s + +d.lengthFt, 0);
    let left = target ?? 0;
    rows = list.map((d, i) => {
      let fill;
      if (target != null) {
        const share = i === list.length - 1 ? left : Math.round(target * (+d.lengthFt / totalLen));
        left -= share;
        fill = fillRow(d.lengthFt, { ...rule, fixtureMode: 'count', perRow: Math.max(1, share) });
      } else fill = fillRow(d.lengthFt, rule);
      return { i, name: d.name || `${a.name} row ${i + 1}`, lengthFt: +d.lengthFt, fill, drawnId: d.id };
    });
  } else {
    const L = +a.lengthFt || 0, Wd = +a.widthFt || 0;
    areaSf = L * Wd;
    rowFt = a.rowAlong === 'width' ? Wd : L; spanFt = a.rowAlong === 'width' ? L : Wd;
    let n = a.rowMode === 'spacing' ? Math.max(1, Math.round(spanFt / Math.max(1, +a.rowSpacingFt || 1))) : Math.max(1, Math.round(+a.rows || 1));
    rowSpacing = spanFt / n;
    let perRow = null;
    if (a.fixtureMode === 'target') {
      const need = targetCount(a, cfg, areaSf);
      perRow = Math.ceil(need / n);
      const max = Math.floor(Math.max(0, rowFt - 2 * (+a.endClearFt || 0)) / fixLenFt(cfg.len) + 1e-9);
      if (perRow > max) warnings.push(`${a.name}: ${need} fixtures won't fit in ${n} row${n > 1 ? 's' : ''} (max ${max} per row). Add rows or use a higher wattage.`);
    }
    const fill = perRow != null ? fillRow(rowFt, { ...rule, fixtureMode: 'count', perRow }) : fillRow(rowFt, rule);
    rows = Array.from({ length: n }, (_, i) => ({ i, name: `${a.name} row ${i + 1}`, lengthFt: rowFt, offsetFt: rowSpacing * (i + 0.5), fill }));
    const mh = (+a.mountFt || 0) - LAYOUT_DEFAULTS.workplaneFt;
    if (mh > 0 && rowSpacing / mh > (a.maxSpacingRatio || LAYOUT_DEFAULTS.maxSpacingRatio)) warnings.push(`${a.name}: rows are ${round1(rowSpacing)}′ apart at ${round1(mh)}′ above the work plane (ratio ${round1(rowSpacing / mh)}). Above about 1.3 the light gets uneven; check photometrics.`);
  }

  const em = emIndexes(rows.length, a.emRows);
  rows.forEach(r => { r.em = em.has(r.i); });
  const runs = rows.filter(r => r.fill.fixtures > 0).map(r => ({
    id: `${a.id}-${r.i}`, name: r.name, fixtures: r.fill.fixtures, continuity: r.fill.continuity,
    gapFt: r.fill.gapFt, jumperFt: +a.jumperFt || LAYOUT_DEFAULTS.jumperFt, leaderFt: +a.leaderFt || LAYOUT_DEFAULTS.leaderFt, em: r.em
  }));
  rows.filter(r => r.lengthFt > 0 && !r.fill.fixtures).forEach(r => warnings.push(`${r.name}: too short for a ${cfg.len}" fixture.`));
  const fixtures = runs.reduce((s, r) => s + r.fixtures, 0);
  const fc = lightEstimate(fixtures, cfg, areaSf, a.cu, a.llf);
  if (fc == null && fixtures && areaSf) notes.push(`Light estimate needs Wide optic lumens; ${cfg.optic} optic needs a photometric check.`);
  return { area: a, rows, runs, cfg, stats: { fixtures, rows: rows.length, areaSf, rowFt, spanFt, rowSpacing, fc, wattsPerSf: areaSf ? fixtures * +cfg.watts / areaSf : null }, warnings, notes };
}

export function targetCount(a, cfg, areaSf) {
  const lm = LUMENS[+cfg.watts] || 0;
  if (!lm) return 0;
  return Math.max(1, Math.ceil((+a.targetFc || 0) * areaSf / (lm * (+a.cu || LAYOUT_DEFAULTS.cu) * (+a.llf || LAYOUT_DEFAULTS.llf))));
}

/* Length of a polyline in plan units, converted with feet-per-unit. */
export function polyLengthFt(points, ftPerUnit) {
  let d = 0; for (let i = 1; i < points.length; i++) d += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return d * ftPerUnit;
}
/* Point at distance t (plan units) along a polyline, for placing fixture marks. */
export function pointAlong(points, t) {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i]; const seg = Math.hypot(x1 - x0, y1 - y0);
    if (t <= seg || i === points.length - 1) { const f = seg ? Math.min(1, Math.max(0, t / seg)) : 0; return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, Math.atan2(y1 - y0, x1 - x0)]; }
    t -= seg;
  }
  return points[0] ? [points[0][0], points[0][1], 0] : [0, 0, 0];
}
