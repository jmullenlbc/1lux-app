// Guided, deterministic formula evaluator for dashboard widgets.
// Only the curated ops below — no free-form code, so widgets can't produce nonsense.
//
// A widget's dataSpec (JSON) shape:
//   {
//     groupBy: 'client'|'serviceType'|null,   // catalog dimension key (null = single total)
//     timeBucket: 'week'|'month'|'quarter'|null,  // when groupBy is a date field
//     terms: [ { field:'productSaleTotal', agg:'sum' }, ... ],  // 1-2 measures
//     op: 'single'|'add'|'subtract'|'multiply'|'divide'|'ratio'|'percent',
//   }
// evalGroup() reduces a set of rows for one group into a single number.

import { readField, fieldByKey } from './fieldCatalog.js';

export const AGG_OPS  = ['sum', 'avg', 'count', 'min', 'max', 'median'];
export const MATH_OPS = ['single', 'add', 'subtract', 'multiply', 'divide', 'ratio', 'percent'];

const AGG_LABEL  = { sum: 'Sum', avg: 'Average', count: 'Count', min: 'Min', max: 'Max', median: 'Median' };
const MATH_LABEL = { single: '—', add: 'A + B', subtract: 'A − B', multiply: 'A × B', divide: 'A ÷ B', ratio: 'A / B', percent: 'A / B (%)' };
export { AGG_LABEL, MATH_LABEL };

function nums(rows, field) {
  const src = field?.source;
  return rows.map(r => Number(readField(r, src))).filter(v => Number.isFinite(v));
}

// A measure can carry a `where` predicate (e.g. Won = count where status in [WON]).
// Rows are pre-filtered by it before aggregating, which is how win rate is built:
// Won ÷ Decided (%). `where` is a raw { source, op, value } on the section row.
function matchWhere(row, where) {
  if (!where) return true;
  const v = readField(row, where.source);
  const inList = Array.isArray(where.value) ? where.value.map(String) : [String(where.value)];
  switch (where.op) {
    case 'in':      return inList.includes(String(v ?? ''));
    case 'not_in':  return !inList.includes(String(v ?? ''));
    case 'is':      return String(v ?? '') === String(where.value);
    case 'is_not':  return String(v ?? '') !== String(where.value);
    case 'gte':     return Number(v) >= Number(where.value);
    case 'lte':     return Number(v) <= Number(where.value);
    default:        return true;
  }
}

export function aggregate(rows, section, term) {
  const field = fieldByKey(section, term.field);
  if (!field) return 0;
  const where = field.where || term.where;
  const scoped = where ? rows.filter(r => matchWhere(r, where)) : rows;
  if (term.agg === 'count' || field.source === '_count') return scoped.length;
  const vals = nums(scoped, field);
  if (!vals.length) return 0;
  switch (term.agg) {
    case 'sum': return vals.reduce((a, b) => a + b, 0);
    case 'avg': return vals.reduce((a, b) => a + b, 0) / vals.length;
    case 'min': return Math.min(...vals);
    case 'max': return Math.max(...vals);
    case 'median': {
      const s = [...vals].sort((a, b) => a - b), m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    default: return vals.reduce((a, b) => a + b, 0);
  }
}

export function applyMath(a, b, op) {
  switch (op) {
    case 'add':      return a + b;
    case 'subtract': return a - b;
    case 'multiply': return a * b;
    case 'divide':
    case 'ratio':    return b ? a / b : 0;
    case 'percent':  return b ? (a / b) * 100 : 0;
    default:         return a; // 'single'
  }
}

// Reduce one group's rows → a single value per the spec.
export function evalGroup(rows, section, spec) {
  const [t1, t2] = spec.terms || [];
  const a = t1 ? aggregate(rows, section, t1) : rows.length;
  if (spec.op === 'single' || !t2) return a;
  const b = aggregate(rows, section, t2);
  return applyMath(a, b, spec.op);
}
