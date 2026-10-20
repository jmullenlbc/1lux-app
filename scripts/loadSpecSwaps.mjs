/**
 * Fill the "we suggest" learning set (SpecSwap, 0136) from a folder of peer
 * review matrices (Mike 10-18: Eluma jobs from the last 1.5 years).
 * Same load as Admin > Users and settings > Peer review matrices.
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
import { buildSwapRows, emptyTotals, loadProductKeys, replaceJobRows } from '../src/lib/specSwap/loadRows.js';

const dir = process.argv[2];
const dry = process.argv.includes('--dry');
if (!dir) {
  console.error('usage: node scripts/loadSpecSwaps.mjs <folder> [--dry]');
  process.exit(1);
}

const prisma = new PrismaClient();

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

  const productByKey = await loadProductKeys(prisma);

  const totals = { jobs: 0, ...emptyTotals(), noTable: [] };
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
    const { rows, totals: t } = buildSwapRows(lines, { job, sheetDate: x.mtime, productByKey });
    for (const k of Object.keys(t)) totals[k] += t[k];
    totals.jobs++;
    if (dry) continue;
    await replaceJobRows(prisma, job, rows);
  }
  console.log(JSON.stringify({ ...totals, files: files.length, dry }, null, 1));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
