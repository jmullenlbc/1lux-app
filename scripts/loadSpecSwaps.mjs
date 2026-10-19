/**
 * Fill the "we suggest" learning set (SpecSwap, 0136) from a folder of peer
 * review matrices (Mike 10-18: Eluma jobs from the last 1.5 years).
 *
 *   node scripts/loadSpecSwaps.mjs "<folder>" [--dry]
 *
 * One job per file name ("X MATRIX (1).xlsx" is a copy of "X MATRIX.xlsx";
 * the newer file wins). Newest tab per job only. Lines with no proposal are
 * skipped (nothing to learn). Re-running archives that job's earlier rows.
 * sheetDate = the file's last changed date (tab dates are not reliable).
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { readMatrixWorkbook, newestLines, jobNameFromFile } from '../src/lib/matrixImport/readMatrix.js';
import { familyKey, normMfr, swapOutcome, categoryOf } from '../src/lib/specSwap/family.js';

const dir = process.argv[2];
const dry = process.argv.includes('--dry');
if (!dir) {
  console.error('usage: node scripts/loadSpecSwaps.mjs <folder> [--dry]');
  process.exit(1);
}

const prisma = new PrismaClient();

function firstLine(s) {
  return String(s || '').split(/\r?\n/)[0].trim();
}

async function main() {
  const files = readdirSync(dir)
    .filter((f) => /\.xlsx$/i.test(f))
    .map((f) => ({ f, full: path.join(dir, f), mtime: statSync(path.join(dir, f)).mtime }));
  const byJob = new Map();
  for (const x of files) {
    const job = jobNameFromFile(x.f);
    const prev = byJob.get(job);
    if (!prev || x.mtime > prev.mtime) byJob.set(job, x);
  }

  // Our products by part number, to set productId on exact matches.
  const products = await prisma.manufacturerProduct.findMany({
    where: { archivedAt: null },
    select: { id: true, partNumber: true, manufacturer: { select: { name: true } } },
  });
  const productByKey = new Map(products.map((p) => [`${normMfr(p.manufacturer?.name)}|${firstLine(p.partNumber).toUpperCase()}`, p.id]));

  const totals = { jobs: 0, rows: 0, SWAPPED: 0, KEPT: 0, PLACEHOLDER: 0, ADDED: 0, skipped: 0, linked: 0, noTable: [] };
  for (const [job, x] of [...byJob.entries()].sort()) {
    let tables;
    try {
      tables = readMatrixWorkbook(XLSX, readFileSync(x.full));
    } catch (e) {
      totals.noTable.push(`${x.f} (${e.message})`);
      continue;
    }
    const lines = newestLines(tables);
    if (!lines.length) {
      totals.noTable.push(x.f);
      continue;
    }
    const rows = [];
    for (const l of lines) {
      const outcome = swapOutcome(l);
      if (!outcome) { totals.skipped++; continue; }
      const propCatalog = firstLine(l.propCatalog) || null;
      const productId = productByKey.get(`${normMfr(l.propMfr)}|${(propCatalog || '').toUpperCase()}`) || null;
      if (productId) totals.linked++;
      totals[outcome]++;
      rows.push({
        sourceKind: 'MATRIX_FILE',
        sourceName: job,
        sheetName: l.sheetName,
        sheetDate: x.mtime,
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
    totals.jobs++;
    totals.rows += rows.length;
    if (dry) continue;
    await prisma.$transaction([
      prisma.specSwap.updateMany({
        where: { sourceKind: 'MATRIX_FILE', sourceName: job, archivedAt: null },
        data: { archivedAt: new Date() },
      }),
      prisma.specSwap.createMany({ data: rows }),
    ]);
  }
  console.log(JSON.stringify({ ...totals, files: files.length, dry }, null, 1));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
