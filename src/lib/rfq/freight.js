// What freight a quote will really cost us, per brand (Mike 11-1). Pure and browser safe.
// First match wins: Typed, Stated, Allowed, Allowed by FFA, Estimated. The first three are
// real figures, the last two our guess, and every figure carries its label. A quote that
// says both allowed and not included asks a person. Warehousing and tax never come from
// quotes: reps do not give them and ILC is a wholesale distributor.
import { cents, sumCents } from '../money.js';
import { normName } from './format.js';
import { lineKey } from './compare.js';
import { freightFromText } from './quoteTerms.js';

export const STARTING_FREIGHT_PCT = 0.02; // Mike 11-1: ILC is charged 2 to 3%
export const FREIGHT_STATUS = ['STATED', 'ALLOWED', 'NOT_INCLUDED', 'SILENT', 'CONFLICT'];

export const rowDollars = (l) => l.extPrice ?? cents((Number(l.qty) || 0) * (Number(l.unitPrice) || 0));
export const rowBrand = (l) => l.manufacturer || l.links?.find((x) => x.rfqLine?.manufacturer)?.rfqLine.manufacturer || '';
const counted = (lines) => (lines || []).filter((l) => l.status !== 'SKIPPED');

/** What to save for a quote's freight, from the read and the quote's own words. */
export function readFreight({ rows = [], total = null, text = '' }) {
  const words = freightFromText(text);
  const good = rows.map((r) => {
    const amount = r.amount == null || r.amount === '' ? null : Number(r.amount);
    const has = Number.isFinite(amount) && amount > 0;
    const asked = String(r.status || '').toUpperCase();
    const status = has ? 'STATED' : FREIGHT_STATUS.includes(asked) && asked !== 'STATED' ? asked : 'SILENT';
    return { manufacturer: String(r.brand ?? r.manufacturer ?? '').trim(), status, amount: has ? amount : null, wording: String(r.wording || '').trim() || null };
  });
  const brandRows = good.filter((r) => r.manufacturer);
  const whole = good.find((r) => !r.manufacturer);
  if (total > 0 && !good.some((r) => r.amount != null)) return [...brandRows, { manufacturer: '', status: 'STATED', amount: total, wording: whole?.wording ?? null }];
  if (whole?.status === 'STATED') return [...brandRows, whole];
  // Rules beat the AI on a contradiction, and "freight not included" beats a $0 total.
  const said = words.status === 'SILENT' && total === 0 ? { status: 'ALLOWED', wording: 'Freight shown as $0 on the quote' } : words;
  const status = said.status === 'CONFLICT' || !whole || whole.status === 'SILENT' ? said.status : whole.status;
  if (status === 'SILENT' && !whole) return brandRows;
  return [...brandRows, { manufacturer: '', status, amount: null, wording: whole?.wording || said.wording || null }];
}

/** The freight table: named brands stay, a whole quote answer spreads over the rest. */
export function freightRows({ freight = [], lines = [] }) {
  const brands = new Map();
  for (const l of counted(lines)) {
    const brand = rowBrand(l);
    const k = normName(brand);
    const e = brands.get(k) || { brand, dollars: 0 };
    e.dollars = sumCents([e.dollars, rowDollars(l)]);
    brands.set(k, e);
  }
  const named = freight.filter((f) => f.manufacturer);
  const whole = freight.find((f) => !f.manufacturer) || null;
  const namedKeys = new Set(named.map((f) => normName(f.manufacturer)));
  const rest = [...brands.entries()].filter(([k]) => !namedKeys.has(k)).map(([, e]) => e);
  const out = named.map((f) => ({
    brand: f.manufacturer, dollars: brands.get(normName(f.manufacturer))?.dollars || 0, status: f.status, amount: f.amount, typedAmount: f.typedAmount ?? null, wording: f.wording || '', fromWhole: false,
  }));
  const wholeFigure = whole && (whole.typedAmount != null || (whole.status === 'STATED' && whole.amount != null));
  if (wholeFigure) {
    out.push({ brand: '', dollars: sumCents(rest.map((e) => e.dollars)), status: whole.status, amount: whole.amount, typedAmount: whole.typedAmount ?? null, wording: whole.wording || '', fromWhole: false });
  } else {
    for (const e of rest) out.push({ brand: e.brand, dollars: e.dollars, status: whole?.status || 'SILENT', amount: null, typedAmount: null, wording: whole?.wording || '', fromWhole: !!whole });
  }
  return out;
}

/** One brand's freight figure and where it came from. */
export function freightFor({ status, amount, typedAmount, brandDollars = 0, ffa = null, historyPct = null, startPct = STARTING_FREIGHT_PCT }) {
  if (typedAmount != null) return { label: 'Typed', amount: cents(typedAmount), real: true };
  if (status === 'STATED' && amount != null) return { label: 'Stated', amount: cents(amount), real: true };
  if (status === 'ALLOWED') return { label: 'Allowed', amount: 0, real: true };
  const estimated = { label: 'Estimated', amount: cents(brandDollars * (historyPct ?? startPct)), real: false };
  if (status === 'CONFLICT') return { ...estimated, asks: true };
  // The quote wins over the FFA on file. A blank or $0 FFA means none is known.
  if (status !== 'NOT_INCLUDED' && ffa > 0 && brandDollars >= ffa) return { label: 'Allowed by FFA', amount: 0, real: false };
  return estimated;
}

/** Brand freight percents from dollars stated on quotes. Typed and Allowed never feed this. */
export function historyRates(stated) {
  const sums = new Map();
  for (const f of stated) {
    const lines = counted(f.lines);
    const brands = [...new Set(lines.map((l) => normName(rowBrand(l))))];
    const key = f.manufacturer ? normName(f.manufacturer) : brands.length === 1 ? brands[0] : '';
    if (!key) continue; // a whole quote figure across brands can't be split fairly
    const dollars = sumCents(lines.filter((l) => normName(rowBrand(l)) === key).map(rowDollars));
    if (dollars <= 0) continue;
    const e = sums.get(key) || { freight: 0, dollars: 0 };
    e.freight += f.amount;
    e.dollars += dollars;
    sums.set(key, e);
  }
  return Object.fromEntries([...sums].map(([k, e]) => [k, e.freight / e.dollars]));
}

/** Everything the quote header shows: coverage, what it really costs, and the check. */
export function quoteSummary(quote, { rfqLines = [], ffaByName = {}, historyByName = {}, startPct = STARTING_FREIGHT_PCT } = {}) {
  const lines = counted(quote.lines);
  const rowsTotal = sumCents(lines.map(rowDollars));
  const links = lines.flatMap((l) => l.links || []);
  const touched = new Set([quote.rfqId, ...links.map((x) => x.rfqLine?.rfqId)].filter(Boolean));
  const priced = new Set(links.map((x) => x.rfqLineId));
  const asked = rfqLines.filter((r) => touched.has(r.rfqId));

  const freight = freightRows({ freight: quote.freight || [], lines }).map((r) => {
    const k = normName(r.brand);
    return { ...r, ...freightFor({ ...r, brandDollars: r.dollars, ffa: ffaByName[k] ?? null, historyPct: historyByName[k] ?? null, startPct }) };
  });
  const freightTotal = sumCents(freight.map((r) => r.amount));
  const stated = sumCents(freight.filter((r) => r.label === 'Stated').map((r) => r.amount));
  const controls = quote.controlsTotal ?? 0;
  const spares = quote.sparesTotal ?? 0;
  const product = quote.productTotal ?? cents(rowsTotal - controls - spares);
  const leads = lines.filter((l) => l.leadWeeksMax != null);
  const longest = leads.length ? leads.reduce((a, b) => (b.leadWeeksMax > a.leadWeeksMax ? b : a)) : null;
  return {
    asked: asked.length,
    priced: asked.filter((r) => priced.has(r.id)).length,
    missing: asked.filter((r) => !priced.has(r.id)).length,
    rowsTotal, product, controls, spares, freight: freightTotal,
    cost: sumCents([product, controls, spares, freightTotal]),
    gap: quote.total == null ? null : cents(quote.total - rowsTotal - stated),
    longestLead: longest ? { text: longest.leadTime || (longest.leadWeeksMax === 0 ? 'In stock' : ''), weeks: longest.leadWeeksMax } : null,
    freightRows: freight,
  };
}

/** The quotes still pricing the job: per line, the newest quote that priced it. */
export function currentQuotes(quotes, keys) {
  const newest = new Map();
  for (const q of [...quotes].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))) {
    for (const l of counted(q.lines)) {
      for (const x of l.links || []) {
        if (x.rfqLine && keys.has(lineKey(x.rfqLine))) newest.set(lineKey(x.rfqLine), q.id);
      }
    }
  }
  const ids = new Set(newest.values());
  return quotes.filter((q) => ids.has(q.id));
}

/** The job roll up: what we charge for freight against what we expect to pay. */
export function jobFreight(summaries, budgetFreight = null) {
  const rows = summaries.flatMap((s) => s.freightRows);
  const expect = sumCents(rows.map((r) => r.amount));
  const dollars = sumCents(rows.map((r) => r.dollars));
  const realDollars = sumCents(rows.filter((r) => r.real).map((r) => r.dollars));
  return {
    budget: budgetFreight,
    expect,
    profit: budgetFreight == null ? null : cents(budgetFreight - expect),
    realShare: dollars > 0 ? realDollars / dollars : null,
  };
}
