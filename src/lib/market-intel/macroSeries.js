/**
 * The national numbers on the Market Intelligence strip (Mike 10-8: "the
 * macro market numbers"). Pure: the catalog, the FRED CSV parser and the
 * formatting. No DB, no fetch, so the page and the tests can import it.
 *
 * Every series is FRED's public CSV, which needs no key:
 *   https://fred.stlouisfed.org/graph/fredgraph.csv?id=SERIES&cosd=YYYY-MM-DD
 * One series per request; several ids at once come back as a zip.
 *
 * `unit`: 'pct' is a rate in percent; 'kunits' is thousands of housing units
 * at a seasonally adjusted annual rate; 'index' is an index level.
 */
export const MACRO_SERIES = [
  { id: 'DFF',          label: 'Fed funds rate',        unit: 'pct',    cadence: 'daily',     blurb: 'Effective federal funds rate. What the Fed is doing to the cost of money.' },
  { id: 'DGS10',        label: '10 yr Treasury',        unit: 'pct',    cadence: 'daily',     blurb: 'Ten-year Treasury yield. Construction loans and cap rates follow it.' },
  { id: 'MORTGAGE30US', label: '30 yr mortgage',        unit: 'pct',    cadence: 'weekly',    blurb: 'Freddie Mac average 30-year fixed rate. High rates keep renters renting.' },
  { id: 'HOUST5F',      label: '5+ unit starts',        unit: 'kunits', cadence: 'monthly',   blurb: 'Housing starts in buildings of five or more units, thousands a year. Our pipeline a year out.' },
  { id: 'COMPU5MUSA',   label: '5+ unit completions',   unit: 'kunits', cadence: 'monthly',   blurb: 'Completions in buildings of five or more units, thousands a year. Lighting ships just before this.' },
  { id: 'PERMIT5',      label: '5+ unit permits',       unit: 'kunits', cadence: 'monthly',   blurb: 'Permits for buildings of five or more units, thousands a year. The earliest national signal.' },
  { id: 'WPUSI012011',  label: 'Materials PPI',         unit: 'index',  cadence: 'monthly',   blurb: 'Producer price index for construction materials. Rising costs squeeze fixture budgets.' },
  { id: 'CUUR0000SEHA', label: 'Rent CPI',              unit: 'index',  cadence: 'monthly',   blurb: 'Consumer price index for rent of primary residence. Rising rents make deals pencil.' },
  { id: 'RRVRUSQ156N',  label: 'Rental vacancy',        unit: 'pct',    cadence: 'quarterly', blurb: 'Rental vacancy rate, Census. High vacancy slows new starts.' },
];

export const MACRO_BY_ID = Object.fromEntries(MACRO_SERIES.map(s => [s.id, s]));

export function fredCsvUrl(id, since) {
  const d = new Date(since);
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}&cosd=${d.toISOString().slice(0, 10)}`;
}

/** [{ date: Date (UTC midnight), value: Number }] from a FRED CSV; "." rows (no observation) are dropped. */
export function parseFredCsv(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/).slice(1)) {
    const [d, v] = line.split(',');
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) continue;
    const n = Number(String(v || '').trim());
    if (!Number.isFinite(n)) continue;
    out.push({ date: new Date(`${d.trim()}T00:00:00.000Z`), value: n });
  }
  return out.sort((a, b) => a.date - b.date);
}

/**
 * The latest observation and the one a year before it (the newest row dated
 * at or before 365 days earlier). Rows may come in any order.
 */
export function latestAndYearAgo(rows) {
  const sorted = [...(rows || [])].filter(r => r && r.date && Number.isFinite(r.value)).sort((a, b) => new Date(a.date) - new Date(b.date));
  const latest = sorted[sorted.length - 1] || null;
  if (!latest) return { latest: null, yearAgo: null };
  const cutoff = new Date(latest.date).getTime() - 365 * 86400e3;
  let yearAgo = null;
  for (const r of sorted) { if (new Date(r.date).getTime() <= cutoff) yearAgo = r; else break; }
  return { latest, yearAgo };
}

/** "3.88%", "344K", "375.9" */
export function formatMacroValue(unit, value) {
  if (value == null || !Number.isFinite(value)) return '';
  if (unit === 'pct')    return `${value.toFixed(2)}%`;
  if (unit === 'kunits') return `${Math.round(value)}K`;
  if (unit === 'money')  return `$${Math.round(value).toLocaleString()}`;
  if (unit === 'count')  return Math.round(value).toLocaleString();
  return value >= 100 ? value.toFixed(1) : value.toFixed(2);
}

/**
 * Change against a year ago: rates in points, everything else in percent.
 * Returns { text, direction } where direction is 'up' | 'down' | 'flat'.
 */
export function formatMacroDelta(unit, latest, yearAgo) {
  if (latest == null || yearAgo == null) return { text: '', direction: 'flat' };
  if (unit === 'pct') {
    const d = latest - yearAgo;
    if (Math.abs(d) < 0.005) return { text: 'unchanged', direction: 'flat' };
    return { text: `${d > 0 ? '+' : ''}${d.toFixed(2)} pts vs a year ago`, direction: d > 0 ? 'up' : 'down' };
  }
  if (!yearAgo) return { text: '', direction: 'flat' };
  const p = ((latest - yearAgo) / Math.abs(yearAgo)) * 100;
  if (Math.abs(p) < 0.05) return { text: 'unchanged', direction: 'flat' };
  return { text: `${p > 0 ? '+' : ''}${p.toFixed(1)}% vs a year ago`, direction: p > 0 ? 'up' : 'down' };
}

/** "Aug 2026" for monthly and quarterly series, "Oct 7, 2026" for daily and weekly. */
export function formatMacroDate(cadence, date) {
  if (!date) return '';
  const d = new Date(date);
  if (cadence === 'daily' || cadence === 'weekly') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  if (cadence === 'quarterly') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
