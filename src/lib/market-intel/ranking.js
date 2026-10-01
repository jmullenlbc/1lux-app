// Market Intel answers (Mike 9-27): "top" = units built in the last 3 years,
// with a note like "most units in 2025, not many in 2023". The web research
// only brings back numbers; the totals, the order and the note are worked out
// here, in code, so the same figures always read the same way. Pure, no DB.

const fmt = n => Number(n).toLocaleString('en-US');

/** The three full years a ranking counts, plus the year so far. */
export function yearWindow(now = Date.now()) {
  const y = new Date(now).getUTCFullYear();
  return { years: [y - 3, y - 2, y - 1], soFar: y };
}

const toInt = v => {
  const n = Math.round(Number(String(v ?? '').replace(/[, ]/g, '')));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Units by year as [{ year, units }], only the years the window shows, one per
 * year (the bigger figure wins a duplicate). Accepts { "2024": 300 } or
 * [{ year, units }].
 */
export function cleanYears(raw, win = yearWindow()) {
  const keep = new Set([...win.years, win.soFar]);
  const list = Array.isArray(raw)
    ? raw.map(r => [r?.year, r?.units])
    : Object.entries(raw && typeof raw === 'object' ? raw : {});
  const by = new Map();
  for (const [y, u] of list) {
    const year = toInt(y), units = toInt(u);
    if (year == null || units == null || !keep.has(year)) continue;
    by.set(year, Math.max(units, by.get(year) ?? 0));
  }
  return [...by].map(([year, units]) => ({ year, units })).sort((a, b) => a.year - b.year);
}

/** Units across the three full years; null when none of them has a figure. */
export function unitsTotal(years, win = yearWindow()) {
  const full = years.filter(y => win.years.includes(y.year));
  return full.length ? full.reduce((n, y) => n + y.units, 0) : null;
}

/**
 * One plain line about how the units fell across the years, e.g.
 * "Most in 2025 (1,240), fewest in 2023 (120)." Years with no figure are left
 * out rather than read as zero: "we found nothing" is not "they built nothing".
 */
export function yearNote(years, win = yearWindow()) {
  const full = win.years.map(y => years.find(r => r.year === y)).filter(Boolean);
  const now = years.find(r => r.year === win.soFar);
  const tail = now ? ` ${fmt(now.units)} so far in ${now.year}.` : '';
  if (!full.length) return now ? tail.trim() : null;

  const built = full.filter(r => r.units > 0);
  let note;
  if (!built.length) note = `None found in ${full.map(r => r.year).join(', ')}.`;
  else if (built.length === 1) note = `All in ${built[0].year} (${fmt(built[0].units)}).`;
  else {
    const max = built.reduce((a, b) => (b.units > a.units ? b : a));
    const min = full.reduce((a, b) => (b.units < a.units ? b : a));
    const first = full[0], last = full[full.length - 1];
    const up = full.every((r, i) => i === 0 || r.units >= full[i - 1].units);
    const down = full.every((r, i) => i === 0 || r.units <= full[i - 1].units);
    if (max.units <= min.units * 1.5 && min.units > 0) {
      note = `Steady, about ${fmt(Math.round(full.reduce((n, r) => n + r.units, 0) / full.length))} a year.`;
    } else if (up && full.length >= 2) {
      note = `Growing: ${fmt(first.units)} in ${first.year} up to ${fmt(last.units)} in ${last.year}.`;
    } else if (down && full.length >= 2) {
      note = `Slowing: ${fmt(first.units)} in ${first.year} down to ${fmt(last.units)} in ${last.year}.`;
    } else {
      note = `Most in ${max.year} (${fmt(max.units)}), fewest in ${min.year} (${fmt(min.units)}).`;
    }
  }
  const missing = win.years.filter(y => !full.some(r => r.year === y));
  const gap = missing.length && full.length ? ` No figure found for ${missing.join(', ')}.` : '';
  return `${note}${gap}${tail}`;
}

/**
 * Rows ready to save: years cleaned, total and note worked out, ranked. A
 * units question ranks by the 3-year total (rows with no figure go last, in the
 * order the research gave them); any other question keeps the research order.
 */
export function rankRows(rows, { byUnits = false, win = yearWindow() } = {}) {
  const out = (rows || []).map((r, i) => {
    const years = cleanYears(r?.unitsByYear ?? r?.years, win);
    return { ...r, years, unitsTotal: unitsTotal(years, win), yearNote: yearNote(years, win), _i: i };
  });
  if (byUnits) {
    out.sort((a, b) => (b.unitsTotal ?? -1) - (a.unitsTotal ?? -1) || a._i - b._i);
  }
  return out.map(({ _i, ...r }, i) => ({ ...r, rank: i + 1 }));
}

/**
 * The JSON answer out of a web search reply. The text before and between
 * searches is the model thinking out loud; only the text after the last
 * search is the answer.
 */
export function readAnswer(content) {
  const blocks = content || [];
  let from = 0;
  blocks.forEach((b, i) => { if (b?.type === 'web_search_tool_result' || b?.type === 'server_tool_use') from = i + 1; });
  const text = blocks.slice(from).filter(b => b?.type === 'text').map(b => b.text || '').join('')
    || blocks.filter(b => b?.type === 'text').map(b => b.text || '').join('');
  const raw = text.replace(/```json|```/g, '');
  const open = raw.indexOf('{'), close = raw.lastIndexOf('}');
  if (open < 0 || close <= open) return null;
  try { return JSON.parse(raw.slice(open, close + 1)); } catch { return null; }
}
