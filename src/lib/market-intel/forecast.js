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

/**
 * Role groups for the company view (Mike 10-8: contractors were mixed in with
 * developers because a permit names the builder). A link with no role counts
 * as a developer: that is what the old extractor meant by a company name.
 */
export const ROLE_GROUPS = {
  DEVELOPER: ['DEVELOPER', 'OWNER', 'INVESTOR', 'BUYER', null],
  GC:        ['GC'],
  OTHER:     ['ARCHITECT', 'LENDER', 'OTHER'],
};

function groupKeysFor(signal, by, roles) {
  const links = signal.tags || [];
  const tags  = links.map(l => l.tag || l);
  if (by === 'company') {
    return links
      .filter(l => (l.tag || l).kind === 'COMPANY' && (!roles || roles.includes(l.role || null)))
      .map(l => l.tag || l)
      .map(t => ({ key: t.normalized, label: t.name, clientId: t.clientId || null }));
  }
  if (by === 'metro')   return tags.filter(t => t.kind === 'METRO').map(t => ({ key: t.normalized, label: t.name }));
  if (by === 'state')   return tags.filter(t => t.kind === 'STATE').map(t => ({ key: t.normalized, label: t.name }));
  return [];
}

/**
 * One line of the "what made this number" list under a row (Mike 10-8: "how
 * can we see what projects made that unit count?"). A project that several
 * articles name is one item at its biggest figure, with the article that
 * printed that figure as the link; an article naming no project is its own item.
 */
function itemFrom(s, label, units) {
  const tags = (s.tags || []).map(l => l.tag || l);
  return {
    signalId:    s.id || null,
    label,
    units,
    kind:        s.kind || 'ARTICLE',
    title:       s.title || null,
    metro:       tags.find(t => t.kind === 'METRO')?.name || null,
    publishedAt: s.publishedAt || null,
    sources:     1,
  };
}

/**
 * @param signals rows with id, kind, title, unitCount, publishedAt and tags[{tag:{kind,name,normalized,clientId}}]
 * @param by 'company' | 'metro' | 'state'
 * @param options.roles company view only: keep company links whose role is in this list (null = no role)
 * @returns rows sorted by units desc: { key, label, clientId?, units, articles, projects, metros[], items[] }
 */
export function rollupUnits(signals = [], by = 'company', { roles = null } = {}) {
  const groups = new Map();
  for (const s of signals) {
    const units = Number(s.unitCount) || 0;
    if (units <= 0) continue;
    const tags     = (s.tags || []).map(l => l.tag || l);
    const projects = tags.filter(t => t.kind === 'PROJECT');
    const metros   = tags.filter(t => t.kind === 'METRO').map(t => t.name);
    for (const g of groupKeysFor(s, by, roles)) {
      let row = groups.get(g.key);
      if (!row) {
        row = { key: g.key, label: g.label, clientId: g.clientId || null, units: 0, articles: 0, projects: 0, metros: new Set(), byProject: new Map(), loose: [] };
        groups.set(g.key, row);
      }
      row.articles++;
      metros.forEach(m => row.metros.add(m));
      if (projects.length) {
        // The first project tag ties the articles together; the biggest figure wins.
        const p    = projects[0];
        const have = row.byProject.get(p.normalized);
        if (!have) row.byProject.set(p.normalized, itemFrom(s, p.name, units));
        else {
          have.sources++;
          if (units > have.units) Object.assign(have, itemFrom(s, p.name, units), { sources: have.sources });
        }
      } else {
        row.loose.push(itemFrom(s, s.title || 'Untitled', units));
      }
    }
  }
  const rows = [];
  for (const row of groups.values()) {
    const items = [...row.byProject.values(), ...row.loose].sort((a, b) => b.units - a.units || String(a.label).localeCompare(String(b.label)));
    rows.push({
      key:      row.key,
      label:    row.label,
      clientId: row.clientId,
      units:    items.reduce((sum, it) => sum + it.units, 0),
      articles: row.articles,
      projects: row.byProject.size,
      metros:   [...row.metros].sort(),
      items,
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
