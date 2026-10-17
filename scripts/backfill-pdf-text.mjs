/**
 * Backfill PDF text extraction (with OCR fallback) for all existing project files.
 * Run with: node scripts/backfill-pdf-text.mjs
 */

import { PrismaClient }  from '@prisma/client';
import { readFile }      from 'fs/promises';
import { existsSync }    from 'fs';
import path              from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import { createCanvas }  from '@napi-rs/canvas';
import Tesseract         from 'tesseract.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const prisma      = new PrismaClient();

// Resolve pdfjs standard fonts path
const require       = createRequire(import.meta.url);
const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
const FONTS_URL     = pathToFileURL(path.join(pdfjsDistPath, 'standard_fonts') + '/').href;

const SCALE = 2.0;

async function renderPage(page) {
  const viewport = page.getViewport({ scale: SCALE });
  const canvas   = createCanvas(viewport.width, viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toBuffer('image/png');
}

async function extractText(buffer) {
  // 1. Try embedded text first (fast, free)
  try {
    const { default: pdfParse } = await import('pdf-parse');
    const data = await pdfParse(buffer);
    const text = data.text?.trim();
    if (text && text.length > 50) return { text, method: 'embedded' };
  } catch {}

  // 2. OCR fallback for scanned PDFs
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({
    data:                new Uint8Array(buffer),
    standardFontDataUrl: FONTS_URL,
    disableFontFace:     false,
    verbosity:           0,  // suppress warnings
  }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page   = await doc.getPage(i);
    const imgBuf = await renderPage(page);
    const result = await Tesseract.recognize(imgBuf, 'eng', { logger: () => {} });
    const text   = result.data.text?.trim();
    if (text) pages.push(`--- Page ${i} ---\n${text}`);
    process.stdout.write(`    OCR page ${i}/${doc.numPages}...\r`);
  }

  await doc.destroy();
  process.stdout.write('\n');
  const text = pages.join('\n\n') || null;
  return { text, method: 'ocr' };
}

async function main() {
  const files = await prisma.projectFile.findMany({
    where: { textContent: null },
    select: { id: true, originalName: true, storedPath: true, mimeType: true },
  });

  const pdfs = files.filter(f =>
    f.mimeType === 'application/pdf' || f.originalName.toLowerCase().endsWith('.pdf')
  );

  console.log(`Found ${pdfs.length} PDF(s) to process.\n`);

  let updated = 0, empty = 0, failed = 0;

  for (const [idx, file] of pdfs.entries()) {
    const fullPath = path.join(projectRoot, 'uploads', file.storedPath);
    console.log(`[${idx + 1}/${pdfs.length}] ${file.originalName}`);

    if (!existsSync(fullPath)) {
      console.log(`  → MISSING on disk\n`);
      failed++;
      continue;
    }

    try {
      const buffer           = await readFile(fullPath);
      const { text, method } = await extractText(buffer);

      if (text) {
        await prisma.projectFile.update({ where: { id: file.id }, data: { textContent: text } });
        console.log(`  → OK [${method}], ${text.length.toLocaleString()} chars\n`);
        updated++;
      } else {
        console.log(`  → EMPTY, no text extracted\n`);
        empty++;
      }
    } catch (e) {
      console.log(`  → ERROR: ${e.message}\n`);
      failed++;
    }
  }

  console.log(`\n──────────────────────────────────`);
  console.log(`Updated: ${updated}   Empty: ${empty}   Failed: ${failed}`);
  console.log(`──────────────────────────────────`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
