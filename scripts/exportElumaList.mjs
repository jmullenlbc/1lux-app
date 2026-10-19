/**
 * Draft Eluma product list from the peer review matrices (Mike 10-18: "That
 * standard products is old. We need to build this out").
 *
 *   node scripts/exportElumaList.mjs "<out.xlsx>"
 *
 * Tab 1 "Eluma families": one row per Eluma catalog family we proposed, with
 * the part numbers used, colour temperatures, what it replaced, how many jobs,
 * median unit CN and whether our product list already has it.
 * Tab 2 "Old list not used": products on the old list no matrix proposed.
 * Internal only (CN prices). Read only: writes nothing to the database.
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { familyKey, normMfr, splitCatalog } from '../src/lib/specSwap/family.js';
import { cctOf } from '../src/lib/specSwap/suggest.js';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/exportElumaList.mjs <out.xlsx>');
  process.exit(1);
}
const prisma = new PrismaClient();

const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = (map, k, by = 1) => k && map.set(k, (map.get(k) || 0) + by);
function median(nums) {
  const v = nums.filter((n) => typeof n === 'number' && n > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return Math.round((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) * 100) / 100;
}

async function main() {
  const swaps = await prisma.specSwap.findMany({
    where: { archivedAt: null, outcome: { in: ['SWAPPED', 'KEPT', 'ADDED'] }, propFamily: { startsWith: 'ELUMA|' } },
  });
  const products = await prisma.manufacturerProduct.findMany({
    where: { archivedAt: null, manufacturer: { name: { contains: 'ELUMA' } } },
    select: { id: true, partNumber: true, description: true, fixtureType: true },
  });
  const productsByFamily = new Map();
  for (const p of products) {
    const k = familyKey('ELUMA', p.partNumber);
    if (!k) continue;
    if (!productsByFamily.has(k)) productsByFamily.set(k, []);
    productsByFamily.get(k).push(p);
  }

  const fams = new Map();
  for (const s of swaps) {
    if (!fams.has(s.propFamily)) {
      fams.set(s.propFamily, { rows: [], catalogs: new Map(), ccts: new Map(), cats: new Map(), replaced: new Map(), jobs: new Set(), descs: new Map() });
    }
    const f = fams.get(s.propFamily);
    f.rows.push(s);
    f.jobs.add(s.sourceName);
    bump(f.catalogs, s.propCatalog);
    bump(f.ccts, cctOf(splitCatalog(s.propCatalog).options.cct));
    bump(f.cats, s.category !== 'other' ? s.category : null);
    bump(f.descs, (s.description || '').toUpperCase().slice(0, 40) || null);
    if (s.outcome === 'SWAPPED') bump(f.replaced, normMfr(s.origMfr));
  }

  const usedFamilies = new Set(fams.keys());
  const rows = [...fams.entries()].map(([key, f]) => {
    const onList = productsByFamily.get(key) || [];
    const last = f.rows.reduce((b, s) => (s.sheetDate > b ? s.sheetDate : b), f.rows[0].sheetDate);
    const cns = f.rows.map((s) => s.unitCn);
    const pos = cns.filter((n) => n > 0);
    return {
      Family: key.slice('ELUMA|'.length),
      'Most used part number': top(f.catalogs, 1)[0]?.[0] || '',
      'Other part numbers': top(f.catalogs, 6).slice(1).map(([c, n]) => `${c} (${n})`).join('; '),
      'Fixture category': top(f.cats, 1)[0]?.[0] || '',
      'Typical description': top(f.descs, 1)[0]?.[0] || '',
      'Colour temps seen': top(f.ccts, 6).map(([c]) => c).join(', '),
      Jobs: f.jobs.size,
      Lines: f.rows.length,
      'Total qty': Math.round(f.rows.reduce((t, s) => t + (s.qty || 0), 0)),
      'Median unit CN': median(cns),
      'Low unit CN': pos.length ? Math.min(...pos) : null,
      'High unit CN': pos.length ? Math.max(...pos) : null,
      'Last seen': last ? new Date(last).toISOString().slice(0, 10) : '',
      'Replaced (brand, times)': top(f.replaced, 4).map(([b, n]) => `${b} ${n}`).join('; '),
      'Example jobs': [...f.jobs].slice(0, 4).join('; '),
      'On old product list?': onList.length ? 'YES' : 'NO',
      'Old list part numbers': onList.slice(0, 5).map((p) => p.partNumber).join('; '),
    };
  }).sort((a, b) => b.Jobs - a.Jobs || b.Lines - a.Lines);

  const unused = products
    .filter((p) => !usedFamilies.has(familyKey('ELUMA', p.partNumber)))
    .map((p) => ({ 'Part number': p.partNumber, Description: p.description || '', 'Fixture type': p.fixtureType || '' }))
    .sort((a, b) => a['Part number'].localeCompare(b['Part number']));

  const wb = XLSX.utils.book_new();
  const add = (name, data, widths) => {
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = widths.map((wch) => ({ wch }));
    if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add('Eluma families', rows, [16, 24, 50, 14, 30, 18, 6, 6, 9, 10, 9, 9, 11, 34, 50, 10, 30]);
  add('Old list not used', unused, [28, 50, 16]);
  writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log(JSON.stringify({ families: rows.length, onOldList: rows.filter((r) => r['On old product list?'] === 'YES').length, oldProducts: products.length, oldUnused: unused.length }));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
