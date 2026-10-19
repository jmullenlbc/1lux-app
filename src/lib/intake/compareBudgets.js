/**
 * Compare up to three of a company's web budgets side by side (portal,
 * Mike 10-17). PURE: given the budgets already worked out, the rows the
 * compare table shows, each with one value per budget and whether they differ.
 * Dollars come from the public budget only (no rates, no rules), the same
 * numbers the wizard shows the visitor.
 *
 * @see src/lib/intake/portalServer.js           compareCompanyBudgets (IO)
 * @see src/app/api/intake/portal/compare        the route
 * @see src/lib/budgetLineItems.js                the breakdown lines
 */
import { budgetLineItems } from '../budgetLineItems.js';
import { labelFor } from './draftHistory.js';

export const MAX_COMPARE = 3;

/** Same value on every budget? Blank and zero count as the same "nothing". */
const norm = v => (v == null || v === '' || v === 0 ? '' : String(v).trim().toLowerCase());
const differs = values => new Set(values.map(norm)).size > 1;

function row(key, label, values, kind, extra = {}) {
  return { key, label, kind, values, differs: differs(values), ...extra };
}

const FACTS = [
  ['projectName', 'Project'],
  ['budgetName', 'Description'],
  ['location', 'Location'],
  ['buildingTypeLabel', 'Building type'],
  ['unitCount', 'Units', 'count'],
  ['grossSf', 'Gross SF', 'count'],
  ['drawings', 'Drawings'],
  ['status', 'Status'],
  ['createdBy', 'Started by'],
];

const TOTALS = [
  ['totalWithControls', 'Budget', 'money', { strong: true }],
  ['subtotalLightingOnly', 'Lighting only', 'money'],
  ['controlsTotal', 'Controls (with freight and warehousing)', 'money'],
  ['salesTax', 'Estimated sales tax', 'money'],
  ['perSf', '$/SF', 'perSf'],
  ['perUnit', '$/Unit', 'money'],
];

const answerKind = key => (key.startsWith('correct') ? 'correction' : key.startsWith('figure') ? 'figure' : 'answer');
// Shown in Facts already, or bookkeeping a visitor never typed.
const SKIP_ANSWERS = new Set(['noDrawings', 'hasClubhouse']);

/**
 * @param {Array<{ id, facts: object, budget: object|null, answers: object }>} items
 * @returns {{ ids: string[], facts, totals, lines, choices }} rows; `lines`
 *   are categories with `details`; rows with nothing on any budget are left out.
 */
export function compareBudgetRows(items) {
  const list = (Array.isArray(items) ? items : []).slice(0, MAX_COMPARE);
  const ids = list.map(b => b.id);

  const facts = FACTS.map(([k, label, kind]) => row(k, label, list.map(b => b.facts?.[k] ?? null), kind || 'text'));

  const totals = TOTALS.map(([k, label, kind, extra]) => row(k, label, list.map(b => {
    const bud = b.budget;
    if (!bud) return null;
    if (k === 'salesTax') return (Number(bud.lightingTaxAmount) || 0) + (Number(bud.controlsTaxAmount) || 0);
    const n = Number(bud[k]);
    return Number.isFinite(n) ? n : null;
  }), kind, extra)).filter(r => r.values.some(v => v));

  // Line up the categories and their detail lines by key; a line one budget
  // has and another lacks reads as zero on the other.
  const perBudget = list.map(b => (b.budget ? budgetLineItems(b.budget.sections) : []));
  const order = [];
  const cats = new Map();
  perBudget.forEach((cs, i) => {
    for (const c of cs) {
      if (!cats.has(c.key)) { cats.set(c.key, { label: c.label, values: list.map(() => 0), details: new Map(), order: [] }); order.push(c.key); }
      const cat = cats.get(c.key);
      cat.values[i] = c.value || 0;
      for (const d of c.details || []) {
        if (!cat.details.has(d.key)) { cat.details.set(d.key, { label: d.label, values: list.map(() => 0) }); cat.order.push(d.key); }
        cat.details.get(d.key).values[i] = d.value || 0;
      }
    }
  });
  const lines = order.map(k => {
    const c = cats.get(k);
    const details = c.order.map(dk => {
      const d = c.details.get(dk);
      return row(`${k}.${dk}`, d.label, d.values, 'money');
    }).filter(d => d.values.some(v => v));
    return { ...row(k, c.label, c.values, 'money'), details };
  }).filter(c => c.values.some(v => v) || c.details.length);

  // The visitor's own answers, figures and corrections, union of keys.
  const keys = [];
  const seen = new Set();
  for (const b of list) {
    for (const k of Object.keys(b.answers || {})) {
      if (SKIP_ANSWERS.has(k) || seen.has(k)) continue;
      seen.add(k); keys.push(k);
    }
  }
  const choices = keys
    .map(k => row(k, labelFor(answerKind(k), k), list.map(b => {
      const v = b.answers?.[k];
      return v == null || v === '' ? null : String(v);
    }), 'text'))
    .filter(r => r.values.some(v => v != null));

  return { ids, facts, totals, lines, choices };
}
