// Turn an uploaded file into text the bot can search.
//
// Server-only, it reaches for pdfjs, XLSX and Tesseract. The pure helpers it
// leans on live in ./text.js, which is where the unit tests point.
//
// Everything here is bounded on purpose. Amplify's front door kills any request
// running longer than ~30 seconds with an empty 504 (see CLAUDE.md), and OCR is
// slow enough to hit that on its own. So page counts are capped, OCR is capped
// much harder, and a file that runs past the cap comes back with the text we did
// get plus an honest note saying it was truncated, never a silent half-read.

import path from 'path';
import { createRequire } from 'module';
import { readZipEntry } from './zip.js';
import { docxXmlToText, tidyText, isUsefulText, detectFileType } from './text.js';

const require = createRequire(import.meta.url);

// How much of a document we are willing to read in one request.
export const MAX_TEXT_PAGES = 120;  // text-layer read: fast, ~10ms a page
export const MAX_OCR_PAGES  = 5;    // OCR: seconds a page, and the 30s wall is real

// ── The clock ─────────────────────────────────────────────────────────────────
//
// Page counts alone stopped being enough when the size limit went from 4 MB to
// 25 MB (Mike, 2026-09-07: "we should make it up to 25mbs like email"). A page
// is not a fixed amount of work, a dense drawing sheet can cost fifty times
// what a page of a Word document does, so 120 pages of the wrong document can
// still run past the front door's ~30 second limit, and a request that does
// that dies with an empty 504 and no row written at all.
//
// So the reader also watches a clock. When the budget is spent it stops with
// whatever it has and says so, which turns the worst case from "the file
// vanished" into "we read the first 40 pages of it".
export const READ_BUDGET_MS = 20_000;

// OCR cannot be interrupted once started, it is one call into Tesseract that
// blocks until it is done. So it is not started at all unless there is enough
// of the budget left to finish inside it.
const OCR_NEEDS_MS = 12_000;

const clockFrom = (budgetMs = READ_BUDGET_MS) => {
  const endsAt = Date.now() + budgetMs;
  return { remaining: () => endsAt - Date.now() };
};

// ── PDF ───────────────────────────────────────────────────────────────────────

// Pull the text layer. Most PDFs that came out of Word, InDesign or a plan set
// have one, and reading it is hundreds of times faster than looking at pixels.
async function pdfTextLayer(buffer, clock) {
  const { loadPdfjs } = await import('@/lib/pdfjsNode.js');
  const pdfjsLib      = await loadPdfjs();
  const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const fontsUrl      = `file://${pdfjsDistPath}/standard_fonts/`.replace(/\\/g, '/');

  const doc = await pdfjsLib.getDocument({
    data:                new Uint8Array(buffer),
    standardFontDataUrl: fontsUrl,
    verbosity:           0,
  }).promise;

  const total = doc.numPages;
  const limit = Math.min(total, MAX_TEXT_PAGES);
  const parts = [];

  let read = 0;
  for (let i = 1; i <= limit; i++) {
    // Checked before each page rather than after, so we never start a page we
    // have no time to finish.
    if (clock.remaining() <= 0) break;
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    const text    = content.items.map(it => it.str).join(' ').trim();
    if (text) parts.push(text);
    read = i;
  }

  return { text: tidyText(parts.join('\n\n')), pageCount: total, readPages: read };
}

async function extractPdf(buffer, clock) {
  const layer = await pdfTextLayer(buffer, clock);

  if (isUsefulText(layer.text)) {
    const truncated = layer.readPages < layer.pageCount;
    return {
      text:      layer.text,
      pageCount: layer.pageCount,
      note:      truncated
        ? `Read the first ${layer.readPages} of ${layer.pageCount} pages. The rest was too long to read in one go.`
        : null,
    };
  }

  // Nothing readable in the text layer means it is a scan. Look at the pixels,
  // but only for the first few pages, a scanned 200-page set is not something
  // to OCR inside a web request.
  if (clock.remaining() < OCR_NEEDS_MS) {
    return {
      text: '', pageCount: layer.pageCount,
      note: 'This PDF is a scan and it is too large to read the text off the image in one go. '
          + 'It is saved. Add a description so the bot knows what it is, or drop in a smaller part of it.',
    };
  }

  const { extractTextFromPdf } = await import('@/lib/ocr.js');
  const ocrText = tidyText(await extractTextFromPdf(buffer));

  if (!isUsefulText(ocrText)) {
    return {
      text: '', pageCount: layer.pageCount,
      note: 'This PDF is a scan and nothing legible could be read off it.',
    };
  }

  return {
    text:      ocrText,
    pageCount: layer.pageCount,
    note:      `Scanned PDF: text was read off the image${layer.pageCount > MAX_OCR_PAGES ? `, first ${MAX_OCR_PAGES} pages only` : ''}.`,
  };
}

// ── Word ──────────────────────────────────────────────────────────────────────

async function extractWord(buffer, fileName) {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.rtf')) {
    // RTF is plain text wrapped in control words. Crude but genuinely adequate.
    const raw = buffer.toString('utf8')
      .replace(/\\par[d]?/g, '\n')
      .replace(/\{\\\*[^{}]*\}/g, '')
      .replace(/\\[a-z]+-?\d* ?/gi, '')
      .replace(/[{}]/g, '');
    return { text: tidyText(raw), note: null };
  }

  if (lower.endsWith('.doc')) {
    // The pre-2007 binary format. Not a ZIP, not XML, not worth hand-parsing.
    return {
      text: '',
      note: 'Old-style .doc files cannot be read. Open it in Word and "Save As" .docx, then drop it in again.',
    };
  }

  const xml = readZipEntry(buffer, 'word/document.xml');
  if (!xml) {
    return { text: '', note: 'This does not look like a Word file inside. No document found in it.' };
  }
  return { text: docxXmlToText(xml.toString('utf8')), note: null };
}

// ── Excel ─────────────────────────────────────────────────────────────────────

function extractExcel(buffer) {
  const XLSX = require('xlsx');
  const wb   = XLSX.read(buffer, { type: 'buffer' });

  const parts = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    if (csv.trim()) parts.push(`--- ${name} ---\n${csv.trim()}`);
  }

  return {
    text: tidyText(parts.join('\n\n')),
    note: wb.SheetNames.length > 1 ? `${wb.SheetNames.length} sheets read.` : null,
  };
}

// ── Image ─────────────────────────────────────────────────────────────────────

async function extractImage(buffer, clock) {
  if (clock.remaining() < OCR_NEEDS_MS) {
    return {
      text: '',
      note: 'This image is too large to read the text off in one go. It is saved. Add a description so the bot knows what it is.',
    };
  }

  const Tesseract = (await import('tesseract.js')).default;
  const result    = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
  const text      = tidyText(result?.data?.text || '');

  if (!isUsefulText(text)) {
    return {
      text: '',
      note: 'No readable text was found in this image. It is saved, but the bot has nothing to quote from it. Add a description so it knows what this is.',
    };
  }
  return { text, note: 'Text was read off the image.' };
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Read whatever was uploaded.
 *
 * Always resolves, a file that cannot be read comes back as
 * { status: 'FAILED', note } rather than throwing, because the file has already
 * been stored by then and losing the row would lose the file with it.
 *
 * `budgetMs` is how long the reading may take before it stops and reports what
 * it got. It exists so a big file can never take the whole request down with it
 * see READ_BUDGET_MS above.
 */
export async function extractDocumentText(buffer, fileName, mimeType, { budgetMs } = {}) {
  const fileType = detectFileType(fileName, mimeType);
  const clock    = clockFrom(budgetMs);

  try {
    let result;
    switch (fileType) {
      case 'pdf':   result = await extractPdf(buffer, clock);       break;
      case 'word':  result = await extractWord(buffer, fileName);   break;
      case 'excel': result = extractExcel(buffer);                  break;
      case 'image': result = await extractImage(buffer, clock);     break;
      case 'text':  result = { text: tidyText(buffer.toString('utf8')), note: null }; break;
      default:
        return { fileType: null, text: '', status: 'FAILED', note: `"${fileName}" is not a file type the bot can read.` };
    }

    const text = result.text || '';
    return {
      fileType,
      text,
      pageCount: result.pageCount ?? null,
      status:    isUsefulText(text) ? 'READY' : 'FAILED',
      note:      result.note || (isUsefulText(text) ? null : 'Nothing readable could be pulled out of this file.'),
    };
  } catch (err) {
    return {
      fileType,
      text:   '',
      status: 'FAILED',
      note:   `This file could not be opened: ${err.message}`,
    };
  }
}
