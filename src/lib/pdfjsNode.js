/**
 * pdfjsNode — the ONLY place the server is allowed to load pdfjs-dist.
 *
 * Why this file exists
 * -------------------
 * pdfjs-dist resolves two things at RUNTIME, which makes them invisible to
 * Next's file tracer (nft) and therefore absent from the Lambda in production
 * even though everything works locally (local has all of node_modules on disk):
 *
 *   1. standard_fonts/   — pointed at by a constructed file:// URL. Missing it
 *                          means getTextContent() yields no text, so every AI
 *                          parse silently returns 0 rows.
 *   2. pdf.worker.mjs    — pdf.mjs has a static block that does
 *                            GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs"
 *                          on Node, then `await import(this.workerSrc)`. That
 *                          dynamic import is opaque to nft. Missing it means
 *                          getDocument() throws
 *                            Setting up fake worker failed: "Cannot find module ..."
 *                          BEFORE page 1 — the symptom is `pages=0 read=0`.
 *
 * Both are force-included per route in next.config.mjs and asserted against the
 * real build output by scripts/check-runtime-assets.mjs. This module is the
 * belt-and-braces half: it pins workerSrc to an ABSOLUTE file:// path resolved
 * from the installed package, so the worker is found regardless of what the
 * bundler did to the caller's relative paths.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

// Locating the installed package is itself a trap. `createRequire(import.meta.url)`
// is the obvious way and it is NOT reliable here: inside a webpack server bundle
// import.meta.url is rewritten (dev resolves against a phantom `(rsc)` segment),
// so resolve() either throws or hands back a path that does not exist on disk.
// Try each strategy and keep the first one that actually has the files.
function findPkgDir() {
  const candidates = [];

  try { candidates.push(path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))); } catch {}
  // cwd is the app root in `next dev` AND /var/task in the Lambda.
  try { candidates.push(path.dirname(createRequire(path.join(process.cwd(), 'package.json')).resolve('pdfjs-dist/package.json'))); } catch {}
  candidates.push(path.join(process.cwd(), 'node_modules', 'pdfjs-dist'));

  for (const dir of candidates) {
    try {
      if (dir && fs.existsSync(path.join(dir, 'legacy', 'build', 'pdf.worker.mjs'))) return dir;
    } catch {}
  }
  return null;
}

const PKG_DIR = findPkgDir();

/** Absolute file:// URL of the worker, or null if the package could not be located. */
export const WORKER_URL = PKG_DIR
  ? pathToFileURL(path.join(PKG_DIR, 'legacy', 'build', 'pdf.worker.mjs')).href
  : null;

/**
 * file:// URL of pdfjs-dist/wasm/ (trailing slash required), or null.
 *
 * The third runtime-resolved asset, found 2026-08-29 on the Lowell set: pdfjs
 * decodes fax-compressed (CCITT/JBIG2) and JPEG2000 images through WebAssembly
 * helpers it loads from `wasmUrl` at decode time. With wasmUrl unset it does
 * not throw -- it logs a warning and SKIPS the image. On drawings that come
 * out as solid black or blank blocks exactly where a table or photo should be,
 * because the paint underneath the missing stencil is what survives.
 */
export const WASM_URL = PKG_DIR
  ? `${pathToFileURL(path.join(PKG_DIR, 'wasm')).href}/`
  : null;

/**
 * file:// URL of pdfjs-dist/standard_fonts/ (trailing slash required), or null.
 * pathToFileURL, not string concatenation: on Windows a bare `file://C:/...` is
 * not a well-formed URL (the drive letter lands in the host position).
 */
export const STANDARD_FONTS_URL = PKG_DIR
  ? `${pathToFileURL(path.join(PKG_DIR, 'standard_fonts')).href}/`
  : null;

let cached = null;

/**
 * Load pdfjs for server-side use with the worker path already pinned.
 * Always use this instead of importing 'pdfjs-dist/legacy/build/pdf.mjs' directly.
 */
export async function loadPdfjs() {
  if (cached) return cached;
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // pdf.mjs's own static block already did
  //   GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs"
  // and that relative specifier is what breaks — so overwrite it unconditionally
  // with an absolute URL rather than defaulting it.
  if (WORKER_URL) {
    try { pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL; } catch {}
  } else {
    console.error('[pdfjsNode] could not locate pdfjs-dist on disk — PDF reading will fail');
  }

  cached = pdfjsLib;
  return pdfjsLib;
}

/** Standard getDocument options for server-side text extraction. */
export function pdfDocOptions(buffer, extra = {}) {
  return {
    // ALWAYS re-wrap: a Node Buffer IS a Uint8Array subclass, and pdfjs rejects
    // Buffers outright ("Please provide binary data as `Uint8Array`").
    data: new Uint8Array(buffer),
    ...(STANDARD_FONTS_URL ? { standardFontDataUrl: STANDARD_FONTS_URL } : {}),
    ...(WASM_URL ? { wasmUrl: WASM_URL } : {}),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
    ...extra,
  };
}
