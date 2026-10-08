/**
 * forecast.js: units by company and by region, worked out in code from the
 * tagged signals (Mike 10-7: "pull out # of units so we can forecast pipeline
 * and understand how many units companies build in regions"). Pure.
 *
 * The trap is double counting. One building gets five articles (zoning,
 * financing, groundbreaking, topping out, lease-up), each stating 342 units.
 * Summing them says 1,710. So inside one group, articles that name the same
 * PROJECT tag count once, at the largest figure printed. Articles that name no
 * project each count once, since there is nothing to tie them together.
 */

function groupKeysFor(signal, by) {
  const tags = (signal.tags || []).map(l => l.tag || l);
  if (by === 'company') return tags.filter(t => t.kind === 'COMPANY').map(t => ({ key: t.normalized, label: t.name, clientId: t.clientId || null }));
  if (by === 'metro')   return tags.filter(t => t.kind === 'METRO').map(t => ({ key: t.normalized, label: t.name }));
  if (by === 'state')   return tags.filter(t => t.kind === 'STATE').map(t => ({ key: t.normalized, label: t.name }));
  return [];
}

/**
 * @param signals rows with unitCount, publishedAt and tags[{tag:{kind,name,normalized,clientId}}]
 * @param by 'company' | 'metro' | 'state'
 * @returns rows sorted by units desc: { key, label, clientId?, units, articles, projects, metros[] }
 */
export function rollupUnits(signals = [], by = 'company') {
  const groups = new Map();
  for (const s of signals) {
    const units = Number(s.unitCount) || 0;
    if (units <= 0) continue;
    const tags     = (s.tags || []).map(l => l.tag || l);
    const projects = tags.filter(t => t.kind === 'PROJECT').map(t => t.normalized);
    const metros   = tags.filter(t => t.kind === 'METRO').map(t => t.name);
    for (const g of groupKeysFor(s, by)) {
      let row = groups.get(g.key);
      if (!row) {
        row = { key: g.key, label: g.label, clientId: g.clientId || null, units: 0, articles: 0, projects: 0, metros: new Set(), byProject: new Map(), loose: 0 };
        groups.set(g.key, row);
      }
      row.articles++;
      metros.forEach(m => row.metros.add(m));
      if (projects.length) {
        // The first project tag ties the articles together; the biggest figure wins.
        const p = projects[0];
        row.byProject.set(p, Math.max(row.byProject.get(p) || 0, units));
      } else {
        row.loose += units;
      }
    }
  }
  const rows = [];
  for (const row of groups.values()) {
    let projUnits = 0;
    for (const u of row.byProject.values()) projUnits += u;
    rows.push({
      key:      row.key,
      label:    row.label,
      clientId: row.clientId,
      units:    projUnits + row.loose,
      articles: row.articles,
      projects: row.byProject.size,
      metros:   [...row.metros].sort(),
    });
  }
  rows.sort((a, b) => b.units - a.units || a.label.localeCompare(b.label));
  return rows;
}

/** Signals published within the last `months` months (or undated ones, which are kept). */
export function withinMonths(signals = [], months = 12, now = Date.now()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return signals.filter(s => !s.publishedAt || new Date(s.publishedAt) >= cutoff);
}
