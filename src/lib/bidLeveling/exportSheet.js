/**
 * The leveled sheet as Excel tabs (Mike 10-26, bid step 2). Pure: takes the
 * same view the Bid Leveling screen shows and returns plain rows per tab, so
 * the route only wraps them in a workbook.
 *
 * Never carries the "We suggest" column (past job CN) or any DN. When the
 * public tool comes, this is the sheet a GC downloads.
 */
import { BID_FLAG_KEYS, FLAG_GROUPS, FLAG_STATE_LABELS } from './bidFlags.js';
import { sageColumn } from './sageAlternates.js';
import { cents } from '../money.js';

const TOTAL_ROWS = [
  ['fixtures', 'Fixtures'], ['controls', 'Controls'], ['adders', 'Adders'], ['spares', 'Spares'],
  ['freight', 'Freight'], ['warehousing', 'Warehousing'], ['tax', 'Tax'],
];
const CONF_TEXT = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
const MODE_TEXT = { RATIO: 'Scale to fixtures', AS_QUOTED: 'As quoted', FLAT: 'Same flat amount' };
const GROUP_TEXT = { VE: 'Value engineering', ALT: 'Alternate' };

const r2 = (n) => (n == null || !Number.isFinite(Number(n)) ? null : cents(n));
const rowLabel = (r) => r.typeTag + (r.variant === 'P' ? ' pole' : r.variant ? ` ${r.variant}` : '');
// Stored quote dates are midnight UTC; today is the reader's own day.
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const asQuoted = (bid) => {
  const g = bid.totals.filter((t) => t.bucket === 'GRAND').reduce((s, t) => s + t.amount, 0);
  return g || bid.totals.filter((t) => t.bucket !== 'GRAND').reduce((s, t) => s + t.amount, 0) || null;
};

function totalsTab(view, { projectName, today }) {
  const { bids, normalized, leveling } = view;
  const per = normalized?.perBid || {};
  const baseline = bids.find((b) => b.id === normalized?.baselineBidId);
  const grands = bids.map((b) => per[b.id]?.grand).filter((g) => g != null);
  const lowest = grands.length ? Math.min(...grands) : null;
  const rows = [
    ['Project', projectName || ''],
    ['Leveling', leveling?.name || ''],
    ['Baseline (sets the quantities)', baseline?.bidderName || ''],
    ['Freight', MODE_TEXT[leveling?.freightMode] || ''],
    ['Warehousing', MODE_TEXT[leveling?.whMode] || ''],
    ['Tax rate', leveling?.taxRate != null ? `${r2(leveling.taxRate * 100)}%` : 'Each quote\'s own rate'],
    ['Downloaded', localDay(today)],
    [],
    ['', ...bids.map((b) => b.bidderName)],
    ['As quoted', ...bids.map((b) => r2(asQuoted(b)))],
  ];
  for (const [k, label] of TOTAL_ROWS) {
    rows.push([label, ...bids.map((b) => r2(per[b.id]?.[k]))]);
    if (k === 'fixtures') {
      rows.push(['  of which placeholders', ...bids.map((b) => r2(per[b.id]?.fixturesPlaceholder) || null)]);
      if (bids.some((b) => per[b.id]?.fixturesOwnQty)) rows.push(['  of which at their own qty', ...bids.map((b) => r2(per[b.id]?.fixturesOwnQty) || null)]);
    }
  }
  rows.push(['Leveled total', ...bids.map((b) => r2(per[b.id]?.grand))]);
  rows.push(['Lowest', ...bids.map((b) => (lowest != null && per[b.id]?.grand === lowest ? 'Lowest' : ''))]);
  rows.push(['Confidence', ...bids.map((b) => CONF_TEXT[per[b.id]?.confidence?.level] || '')]);
  rows.push(['Placeholder share', ...bids.map((b) => {
    const c = per[b.id]?.confidence;
    return c ? (c.hasUnitPricing ? `${Math.round((c.placeholderShare || 0) * 100)}%` : 'No unit pricing') : '';
  })]);
  rows.push([]);
  rows.push(['Every bid is priced on the same quantities. A type a bid left out is filled at the other bids\' price (a placeholder), so confidence drops as placeholders grow.']);
  return { name: 'Leveled totals', rows, cols: [26, ...bids.map(() => 18)], moneyFrom: 9, moneyCols: bids.map((_, i) => i + 1) };
}

function typesTab(view) {
  const { bids, matrix } = view;
  const variance = (key, bidId) => matrix.qtyVariances.find((v) => v.key === key && v.bidId === bidId);
  // Sage alternate (Mike 10-28): a plain name, no part number, no price.
  const sage = sageColumn(view);
  const head1 = ['Type', 'Sage alternate'];
  const head2 = ['', ''];
  for (const b of bids) {
    head1.push(b.bidderName, '', '', '', '', '');
    head2.push('Qty', 'Unit', 'Unit price', 'Extended', 'Maker and part', 'Note');
  }
  const rows = [head1, head2];
  for (const r of matrix.types) {
    const row = [rowLabel(r), sage[r.key]?.name || ''];
    for (const b of bids) {
      const c = r.cells[b.id];
      if (c?.specBasis === 'IN_HEAD') {
        row.push(null, c.uom || '', null, null, '', 'In fixture price');
        continue;
      }
      const missing = !c || !(c.qty > 0);
      if (missing) {
        const why = c?.specBasis === 'NOT_USED' ? 'Not used' : c?.specBasis === 'NO_QUOTE' ? 'No quote' : c ? 'Zero' : 'Missing';
        row.push(c?.qty ?? null, c?.uom || '', null, null, '', why);
        continue;
      }
      const v = variance(r.key, b.id);
      const notes = [];
      if (c.mfr || c.catalog) {
        if (c.requestedCatalog && c.catalog && c.requestedCatalog !== c.catalog) notes.push('Substitute');
      }
      if (v) notes.push(`${v.delta > 0 ? '+' : ''}${v.delta} vs baseline`);
      if (c.uomMismatch) notes.push('Different unit');
      row.push(c.qty, c.uom || 'EA', r2(c.unitPrice), r2(c.extPrice), [c.mfr, c.catalog].filter(Boolean).join(' '), notes.join(', '));
    }
    rows.push(row);
  }
  const moneyCols = bids.flatMap((_, i) => [2 + i * 6 + 2, 2 + i * 6 + 3]);
  const merges = bids.map((_, i) => ({ s: { r: 0, c: 2 + i * 6 }, e: { r: 0, c: 7 + i * 6 } }));
  return { name: 'By type', rows, cols: [10, 30, ...bids.flatMap(() => [8, 6, 11, 12, 24, 20])], moneyFrom: 2, moneyCols, merges };
}

function placeholdersTab(view) {
  const { bids, normalized } = view;
  const rows = [['Bidder', 'Type', 'Qty', 'Unit', 'Price used', 'Amount', 'Why']];
  for (const b of bids) {
    const p = normalized?.perBid?.[b.id];
    for (const l of p?.placeholderLines || []) {
      rows.push([b.bidderName, rowLabel(l), l.qty, l.uom || 'EA', r2(l.unitPlaceholder), r2(l.amount), l.uomMismatch ? 'Quoted in a different unit' : 'Not quoted, filled at other bids\' price']);
    }
    for (const l of p?.ownQtyLines || []) {
      rows.push([b.bidderName, rowLabel(l), l.qty, l.uom || 'EA', null, r2(l.amount), l.why === 'POLE_IN_HEAD' ? 'Baseline has the pole in its fixture price, their own pole line added' : 'Baseline has no qty for this type, their own qty used']);
    }
  }
  for (const b of bids) {
    for (const l of normalized?.extrasNotInBaseline?.[b.id] || []) {
      rows.push([b.bidderName, rowLabel(l), l.qty, l.uom || 'EA', null, r2(l.extPrice), 'Extra, not on the baseline, left out of the total']);
    }
  }
  if (rows.length === 1) rows.push(['No placeholders. Every bid priced every type.']);
  return { name: 'Placeholders', rows, cols: [24, 10, 8, 6, 11, 12, 48], moneyFrom: 1, moneyCols: [4, 5] };
}

function includesTab(view) {
  const { bids, flags } = view;
  const rows = [['', ...bids.map((b) => b.bidderName)]];
  for (const g of FLAG_GROUPS) {
    rows.push([g.label.toUpperCase()]);
    for (const f of BID_FLAG_KEYS.filter((x) => x.group === g.key)) {
      rows.push([f.label, ...bids.map((b) => {
        const cur = flags?.[b.id]?.[f.key];
        const label = FLAG_STATE_LABELS[cur?.state || 'NOT_STATED'];
        return cur?.value ? `${label}: ${cur.value}` : label;
      })]);
    }
  }
  return { name: 'What each includes', rows, cols: [40, ...bids.map(() => 22)] };
}

function questionsTab(view) {
  const rows = [['Bidder', '#', 'Question']];
  for (const b of view.bids) {
    (view.clarifications?.[b.id] || []).forEach((q, i) => rows.push([b.bidderName, i + 1, q]));
  }
  if (rows.length === 1) rows.push(['No open questions.']);
  return { name: 'Questions for bidders', rows, cols: [24, 4, 90] };
}

function packagesTab(view) {
  const rows = [['Bidder', 'Package', 'Types', 'Package total', 'Base for same types', 'Savings']];
  for (const b of view.bids) {
    for (const p of view.packages?.[b.id] || []) {
      rows.push([b.bidderName, GROUP_TEXT[p.group] || p.group, p.types.join(', '), r2(p.total), r2(p.baseSameTypes), r2(p.savings)]);
    }
  }
  if (rows.length === 1) return null;
  return { name: 'VE and alternates', rows, cols: [24, 18, 30, 14, 18, 12], moneyFrom: 1, moneyCols: [3, 4, 5] };
}

function quotesTab(view) {
  const rows = [['Bidder', 'Quote number', 'Quote date', 'Valid until', 'From', 'File']];
  for (const b of view.bids) rows.push([b.bidderName, b.quoteNumber || '', day(b.quoteDate), day(b.expiresAt), b.sourceKind || '', b.sourceFileName || '']);
  return { name: 'Quotes', rows, cols: [24, 16, 12, 12, 10, 40] };
}

/** Tabs in order. Each: { name, rows, cols (widths), moneyFrom (first row with money), moneyCols, merges }. */
export function leveledSheets(view, { projectName = '', today = new Date() } = {}) {
  if (!view?.bids?.length || !view.matrix) return [];
  return [
    totalsTab(view, { projectName, today }),
    typesTab(view),
    placeholdersTab(view),
    includesTab(view),
    questionsTab(view),
    packagesTab(view),
    quotesTab(view),
  ].filter(Boolean);
}

export function leveledFileName(projectName, levelingName, today = new Date()) {
  const clean = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${clean(projectName) || 'Project'}, ${clean(levelingName) || 'Bid leveling'}, ${localDay(today)}.xlsx`;
}
