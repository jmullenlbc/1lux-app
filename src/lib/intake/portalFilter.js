// Filter and sort for the company portal list (Mike 10-16): every field on a
// budget card can narrow the list, and any one of them can order it. Pure, so
// the page and the tests share it.

const location = b => [b.city, b.state].filter(Boolean).join(', ');
const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

// One entry per field: how to read it off a row, and how it filters.
//   kind 'text'   = typed words, case-insensitive "contains"
//   kind 'pick'   = one of the values seen in the list
//   kind 'range'  = min and max numbers
//   kind 'yesno'  = has it or not
export const PORTAL_FIELDS = [
  { key: 'projectName',  label: 'Project',       kind: 'text',  get: b => b.projectName || '' },
  { key: 'budgetName',   label: 'Description',   kind: 'text',  get: b => b.budgetName || '' },
  { key: 'location',     label: 'Location',      kind: 'pick',  get: location },
  { key: 'buildingType', label: 'Building type', kind: 'pick',  get: b => b.buildingTypeLabel || '' },
  { key: 'unitCount',    label: 'Units',         kind: 'range', get: b => num(b.unitCount) },
  { key: 'grossSf',      label: 'Gross SF',      kind: 'range', get: b => num(b.grossSf) },
  { key: 'estimate',     label: 'Budget',        kind: 'range', get: b => num(b.estimate) },
  { key: 'stage',        label: 'Status',        kind: 'pick',  get: b => b.stage?.label || '' },
  { key: 'copiedFrom',   label: 'Copied from',   kind: 'yesno', get: b => (b.copiedFrom ? b.copiedFrom.projectName : '') },
  { key: 'createdBy',    label: 'Started by',    kind: 'pick',  get: b => b.createdBy || '' },
  { key: 'createdAt',    label: 'Started',       kind: 'date',  get: b => b.createdAt || '' },
  { key: 'changedBy',    label: 'Last changed by', kind: 'pick', get: b => b.changedBy || '' },
  { key: 'changedAt',    label: 'Last changed',  kind: 'date',  get: b => b.changedAt || '' },
  { key: 'sentAt',       label: 'Sent to ILC',   kind: 'yesno', get: b => b.sentAt || '' },
];

const FIELD = Object.fromEntries(PORTAL_FIELDS.map(f => [f.key, f]));

// Distinct values for the "pick" fields, read off the rows on screen.
export function portalChoices(groups) {
  const out = {};
  for (const f of PORTAL_FIELDS) {
    if (f.kind !== 'pick') continue;
    const seen = new Set();
    for (const g of groups) for (const b of g.budgets) { const v = f.get(b); if (v) seen.add(v); }
    out[f.key] = [...seen].sort((a, b) => a.localeCompare(b));
  }
  return out;
}

// A filter value is "set" when it would narrow something.
export function activeFilterCount(filters) {
  let n = 0;
  for (const f of PORTAL_FIELDS) {
    const v = filters?.[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (f.kind === 'range') { if (v.min !== '' && v.min !== undefined || v.max !== '' && v.max !== undefined) n++; }
    else n++;
  }
  return n;
}

function keep(b, filters) {
  for (const f of PORTAL_FIELDS) {
    const v = filters?.[f.key];
    if (v === undefined || v === null || v === '') continue;
    const got = f.get(b);
    if (f.kind === 'text') { if (!String(got).toLowerCase().includes(String(v).toLowerCase().trim())) return false; }
    else if (f.kind === 'pick') { if (got !== v) return false; }
    else if (f.kind === 'yesno') { if (v === 'yes' && !got) return false; if (v === 'no' && got) return false; }
    else if (f.kind === 'range') {
      const min = num(v.min), max = num(v.max);
      if (min !== null && (got === null || got < min)) return false;
      if (max !== null && (got === null || got > max)) return false;
    }
  }
  return true;
}

function compare(a, b, f, dir) {
  const x = f.get(a), y = f.get(b);
  let c;
  if (f.kind === 'range') {
    // Blank numbers always sink to the bottom whichever way the sort runs.
    if (x === null && y === null) c = 0;
    else if (x === null) return 1;
    else if (y === null) return -1;
    else c = x - y;
  } else if (f.kind === 'date') {
    c = String(x).localeCompare(String(y));
  } else {
    c = String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
  }
  return dir === 'desc' ? -c : c;
}

// groups: [{ key, name, budgets: [...] }] from the portal list route.
// filters: { [fieldKey]: value }; sort: { key, dir: 'asc'|'desc' }.
// Returns the same shape, with empty groups dropped. Budgets sort inside
// their project and the projects order by their first budget.
export function applyPortalView(groups, filters = {}, sort = null) {
  const f = sort?.key ? FIELD[sort.key] : null;
  const dir = sort?.dir === 'desc' ? 'desc' : 'asc';
  const out = [];
  for (const g of groups || []) {
    const budgets = (g.budgets || []).filter(b => keep(b, filters));
    if (!budgets.length) continue;
    if (f) budgets.sort((a, b) => compare(a, b, f, dir));
    out.push({ ...g, budgets });
  }
  if (f) out.sort((a, b) => compare(a.budgets[0], b.budgets[0], f, dir));
  return out;
}
