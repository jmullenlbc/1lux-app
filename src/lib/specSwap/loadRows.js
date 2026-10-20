/**
 * Matrix lines -> SpecSwap rows (0136). Pure; shared by the folder script
 * (scripts/loadSpecSwaps.mjs) and the admin "Peer review matrices" tab.
 * Lines with no proposal are skipped (nothing to learn). CN only, never DN.
 */
import { familyKey, normMfr, swapOutcome, categoryOf } from './family.js';

export function firstLine(s) {
  return String(s || '').split(/\r?\n/)[0].trim();
}

export function productKey(mfr, partNumber) {
  return `${normMfr(mfr)}|${firstLine(partNumber).toUpperCase()}`;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const TEXT = ['type', 'description', 'location', 'sheetName', 'origMfr', 'origCatalog', 'propMfr', 'propCatalog', 'uom'];

// Lines may come from the browser: text fields as capped strings, nothing else kept.
function cleanLine(l) {
  const out = { qty: num(l?.qty), unitCn: num(l?.unitCn) };
  for (const k of TEXT) {
    const v = l?.[k];
    out[k] = v === null || v === undefined || v === '' ? '' : String(v).slice(0, 2000);
  }
  return out;
}

export function emptyTotals() {
  return { rows: 0, SWAPPED: 0, KEPT: 0, PLACEHOLDER: 0, ADDED: 0, skipped: 0, linked: 0 };
}

/** @returns {{ rows: object[], totals: object }} */
export function buildSwapRows(lines, { job, sheetDate, productByKey }) {
  const totals = emptyTotals();
  const rows = [];
  for (const raw of lines || []) {
    const l = cleanLine(raw);
    const outcome = swapOutcome(l);
    if (!outcome) { totals.skipped++; continue; }
    const propCatalog = firstLine(l.propCatalog) || null;
    const productId = productByKey?.get(productKey(l.propMfr, propCatalog)) || null;
    if (productId) totals.linked++;
    totals[outcome]++;
    rows.push({
      sourceKind: 'MATRIX_FILE',
      sourceName: job,
      sheetName: l.sheetName || null,
      sheetDate: sheetDate || null,
      typeTag: l.type || null,
      description: l.description || null,
      category: categoryOf(l.description, l.location, l.origCatalog, l.propCatalog),
      origMfr: l.origMfr || null,
      origCatalog: firstLine(l.origCatalog) || null,
      origFamily: familyKey(l.origMfr, l.origCatalog),
      propMfr: l.propMfr || null,
      propCatalog,
      propFamily: familyKey(l.propMfr, l.propCatalog),
      productId,
      outcome,
      qty: l.qty,
      uom: l.uom || null,
      unitCn: l.unitCn,
    });
  }
  totals.rows = rows.length;
  return { rows, totals };
}

/** Our products by brand + part number, to set productId on exact matches. */
export async function loadProductKeys(prisma) {
  const products = await prisma.manufacturerProduct.findMany({
    where: { archivedAt: null },
    select: { id: true, partNumber: true, manufacturer: { select: { name: true } } },
  });
  return new Map(products.map((p) => [productKey(p.manufacturer?.name, p.partNumber), p.id]));
}

/** Replace one job's matrix rows: archive the earlier set, add the new one. */
export async function replaceJobRows(prisma, job, rows) {
  await prisma.$transaction([
    prisma.specSwap.updateMany({
      where: { sourceKind: 'MATRIX_FILE', sourceName: job, archivedAt: null },
      data: { archivedAt: new Date() },
    }),
    prisma.specSwap.createMany({ data: rows }),
  ]);
}
