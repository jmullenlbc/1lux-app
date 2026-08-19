#!/usr/bin/env node
/**
 * check-runtime-assets — turns a whole class of prod-only bugs into a build gate.
 *
 * Next traces Lambda files by following STATIC imports. Any asset resolved at
 * RUNTIME (a constructed `file://` path, `require.resolve(...)`, a dynamic import)
 * is invisible to it, so the file is simply absent in production while local works
 * fine — because local has all of node_modules on disk.
 *
 * We have been bitten by this twice:
 *   - @sparticuz/chromium  → PDF routes (fixed earlier via outputFileTracingIncludes)
 *   - pdfjs-dist/standard_fonts → EVERY AI parse route silently returned 0 rows
 *
 * This asserts, against the real build output, that each route below actually
 * ships the asset it needs. Run it AFTER `next build`.
 */
import fs from 'fs';
import path from 'path';

const TRACE_ROOT = '.next/server/app';

// route path (as built) → asset substring that MUST appear in its Lambda trace
const REQUIREMENTS = [
  // pdfjs resolves BOTH of these at runtime, so nft never traces them:
  //   standard_fonts/ — via a constructed file:// URL. Missing → getTextContent
  //                     yields nothing and every AI parse returns 0 rows.
  //   pdf.worker.mjs  — via `await import(GlobalWorkerOptions.workerSrc)` inside
  //                     pdf.mjs. Missing → getDocument() throws "Setting up fake
  //                     worker failed" before page 1 (symptom: pages=0 read=0).
  //                     This shipped broken to prod and killed EVERY server-side
  //                     PDF read; found 2026-08-19 from the construction-schedule tab.
  ...[
    'api/intake/parse',
    'api/projects/[id]/fixture-schedule/parse',
    'api/projects/[id]/files',
    'api/projects/[id]/files/[fileId]/reparse',
    'api/projects/[id]/peer-review/parse-pdf',
    'api/projects/[id]/analyze-contract',
    'api/projects/[id]/drawing-submissions',
    'api/projects/[id]/tracker/extract',
    'api/projects/[id]/tracker/import-toc',
    'api/projects/[id]/site/parse',
    'api/projects/[id]/unit-matrix/parse',
  ].flatMap(route => [
    { route, asset: 'standard_fonts', why: 'pdfjs text extraction returns nothing without the standard fonts' },
    { route, asset: 'pdf.worker.mjs', why: 'pdfjs cannot open a document at all without its worker — getDocument() throws before page 1' },
  ]),
  // headless chromium binary is dynamically imported
  ...[
    'api/projects/[id]/budget/pdf',
    'api/projects/[id]/peer-review/pdf',
    'api/projects/[id]/design-bid-matrix/pdf',
  ].map(route => ({ route, asset: 'sparticuz', why: 'PDF generation cannot launch a browser without the chromium binary' })),
  // @napi-rs/canvas ships a platform-specific native binary (skia .node) used to
  // rasterise PDF pages for the vision fallback. Matching on 'napi-rs' rather
  // than the binary filename keeps this valid on both the Windows dev machine
  // and the Linux build image, where the artefact has a different name.
  {
    route: 'api/intake/parse',
    asset: 'napi-rs',
    why: 'vision extraction cannot rasterise a PDF page without the canvas native binary — drawings with no text layer would fail in prod only',
  },
];

function traceFor(route) {
  const p = path.join(TRACE_ROOT, route, 'route.js.nft.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).files || []; } catch { return null; }
}

if (!fs.existsSync(TRACE_ROOT)) {
  console.log('• check-runtime-assets: no build output — run `next build` first (skipping)');
  process.exit(0);
}

const missing = [];
const notBuilt = [];
for (const { route, asset, why } of REQUIREMENTS) {
  const files = traceFor(route);
  if (!files) { notBuilt.push(route); continue; }
  // Trace paths use the host OS separator — match on the bare name, not a path.
  const found = files.some(f => f.includes(asset));
  if (!found) missing.push({ route, asset, why });
}

if (missing.length) {
  console.error('\n❌ BUILD BLOCKED — runtime assets missing from the Lambda:\n');
  for (const m of missing) {
    console.error(`   /${m.route}`);
    console.error(`     missing: ${m.asset}`);
    console.error(`     impact:  ${m.why}`);
  }
  console.error('\nFix: add the asset to `experimental.outputFileTracingIncludes` in next.config.mjs');
  console.error('     for each route above. Flat dirs need `/*`, nested need `/**/*`.\n');
  process.exit(1);
}

const checked = REQUIREMENTS.length - notBuilt.length;
console.log(`✓ check-runtime-assets: all ${checked} runtime assets present in their Lambda traces`
  + (notBuilt.length ? ` (${notBuilt.length} route(s) not in this build)` : ''));
