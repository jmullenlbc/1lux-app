import { createCanvas } from '@napi-rs/canvas';
import Tesseract from 'tesseract.js';
import path from 'path';
import { createRequire } from 'module';

const require       = createRequire(import.meta.url);
const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
const FONTS_URL     = `file://${pdfjsDistPath}/standard_fonts/`.replace(/\\/g, '/');

const SCALE = 2.0;

async function renderPageToBuffer(page) {
  const viewport = page.getViewport({ scale: SCALE });
  const canvas   = createCanvas(viewport.width, viewport.height);
  const ctx      = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer('image/png');
}

export async function extractTextFromPdf(buffer) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc      = await pdfjsLib.getDocument({
    data:                new Uint8Array(buffer),
    standardFontDataUrl: FONTS_URL,
    disableFontFace:     false,
    verbosity:           0,
  }).promise;

  const pageTexts = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page   = await doc.getPage(i);
    const imgBuf = await renderPageToBuffer(page);
    const result = await Tesseract.recognize(imgBuf, 'eng', { logger: () => {} });
    const text   = result.data.text?.trim();
    if (text) pageTexts.push(`--- Page ${i} ---\n${text}`);
  }

  await doc.destroy();
  return pageTexts.join('\n\n') || null;
}
