/**
 * Backfill parsedAmount for existing budget-tab PDFs.
 * Run once after deploying the budget parsing feature:
 *   node scripts/backfill-budgets.mjs
 */
import { PrismaClient } from '@prisma/client';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const prisma      = new PrismaClient();

async function extractText(buffer) {
  const uint8 = new Uint8Array(buffer);
  const doc   = await pdfjsLib.getDocument({ data: uint8 }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(i => i.str).join(' ') + '\n';
  }
  return text.trim();
}

function parseBudgetTotal(text) {
  if (!text || text.length < 20) return null;
  const flat = text.replace(/\r?\n/g, ' ');
  const totals = [];
  const re = /\btotal\s+\$\s*([\d,]+(?:\.\d{1,2})?)/gi;
  let m;
  while ((m = re.exec(flat)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (n >= 1_000 && n <= 50_000_000) totals.push(n);
  }
  return totals.length ? Math.max(...totals) : null;
}

const files = await prisma.projectFile.findMany({
  where: { tab: 'budgets' },
  select: { id: true, originalName: true, storedPath: true, parsedAmount: true },
});

console.log(`Found ${files.length} budget file(s).\n`);

for (const file of files) {
  const ext = file.originalName.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf') { console.log(`Skipping non-PDF: ${file.originalName}`); continue; }

  const fullPath = path.join(projectRoot, 'uploads', file.storedPath);
  if (!existsSync(fullPath)) { console.log(`Missing on disk: ${file.originalName}`); continue; }

  console.log(`Processing: ${file.originalName}`);
  try {
    const buffer = await readFile(fullPath);
    const text   = await extractText(buffer);
    const amount = parseBudgetTotal(text);

    await prisma.$executeRawUnsafe(
      `UPDATE "ProjectFile" SET "parsedAmount" = ?, "textContent" = ? WHERE "id" = ?`,
      amount, text, file.id
    );
    console.log(`  → total: ${amount != null ? '$' + amount.toLocaleString() : 'not found'}`);
  } catch (e) {
    console.log(`  → ERROR: ${e.message}`);
  }
}

await prisma.$disconnect();
