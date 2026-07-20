/**
 * Vision extraction for drawings with no text layer.
 *
 * ── Why this exists ──
 * Measured against 16 real conceptual drawings from the shared drive, 4 have no
 * text layer at all — and 3 of those are the dedicated site / concept plans,
 * i.e. exactly the documents we need for lot size, unit count and parking.
 * Text extraction returns literally nothing from them.
 *
 * ── The key insight ──
 * We do NOT count parking stalls off the geometry. Architects write the numbers
 * down. Beckett Firestone carries a hand-lettered SITE DATA block giving
 * 16.50 Ac, 324 D.U., the bed mix, and "PROVIDED 680 spaces". Reading that box
 * is a vision problem, not a computer-vision counting problem.
 *
 * But it is not always present: Beckett Eastchase states "TOTAL NO. OF UNITS:
 * 324" and labels garages, yet gives no parking total anywhere — the stalls are
 * pure geometry. So the prompt below is built around one rule: **report what is
 * written, return null for what is not, and never estimate from the drawing.**
 * A missing number is visible to a reviewer; an invented one is not.
 */
import { createCanvas } from '@napi-rs/canvas';

/**
 * Long-edge pixels for the render handed to the model.
 *
 * Measured on the hand-lettered Beckett Firestone SITE DATA block:
 *   1600px → totalUnits read as 264 (truth: 324), 2BR as 113 (truth: 118)
 *   2200px → every unit figure correct
 *   3000px → identical to 2200px, ~60% more image data for no gain
 * So 2200 is the accuracy floor, not a comfort margin. Do not lower it to save
 * tokens — below it the model returns plausible, wrong numbers.
 */
const MAX_EDGE = 2200;

/** Hard cap on pages sent. Site plans are typically one sheet. */
const MAX_PAGES = 3;

/**
 * Render PDF pages to PNG buffers.
 * Server-only — pulls in @napi-rs/canvas and pdfjs.
 *
 * `createCanvas` is imported STATICALLY on purpose. @napi-rs/canvas resolves a
 * platform-specific native binary, and Next's output file tracing only follows
 * static imports — a dynamic `await import()` here would leave the .node binary
 * out of the Lambda and fail in production while working locally. Same class of
 * bug as the pdfjs standard_fonts omission. `src/lib/ocr.js` does it this way
 * and is proven in prod.
 */
export async function renderPdfPages(buffer, { pages = MAX_PAGES, maxEdge = MAX_EDGE } = {}) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const count = Math.min(doc.numPages, pages);
  const out = [];

  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    // Scale so the long edge lands near maxEdge. Rendering at native CAD size
    // (5184px on Firestone) costs many times more tokens for no extra accuracy,
    // since the model downsamples anyway.
    const scale = maxEdge / Math.max(base.width, base.height);
    const vp = page.getViewport({ scale });
    const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    // Drawings are usually transparent-background; without this they render
    // as black-on-black and the model sees nothing.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, vp.width, vp.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push({ page: i, png: canvas.toBuffer('image/png'), width: Math.round(vp.width), height: Math.round(vp.height) });
  }

  return out;
}

export const SITE_VISION_SYSTEM = `You read architectural site plans and concept drawings and report the project data written on them.

Return ONLY valid JSON — no markdown, no commentary:
{
  "lotAcres": number or null,
  "lotSf": number or null,
  "totalUnits": number or null,
  "bedMix": { "studio": number or null, "oneBed": number or null, "twoBed": number or null, "threeBed": number or null },
  "parkingProvided": number or null,
  "parkingRequired": number or null,
  "surfaceParking": number or null,
  "garages": number or null,
  "carports": number or null,
  "buildingCount": number or null,
  "clubhouseSf": number or null,
  "amenitySf": number or null,
  "buildingType": "string or null",
  "confidence": number (0.0-1.0),
  "foundSiteDataBlock": boolean,
  "notes": "string - what you read it from, and anything ambiguous"
}

CRITICAL RULES:
- Report ONLY numbers that are WRITTEN on the drawing. Look hardest at any "SITE DATA", "PROJECT DATA", "ZONING", "UNIT MIX" or "PARKING" summary block, and at title-block callouts. These are often hand-lettered or marked up — read them anyway.
- If a number is not written down, return null. NEVER estimate, infer, or count objects in the drawing to produce a number. A null is correct and useful; a guessed number is harmful because it becomes a budget.
- In particular: do NOT count parking stalls, light fixtures, or building footprints by eye. If a parking total is not stated in text, parkingProvided and surfaceParking must be null.
- lotAcres/lotSf: use the site area if stated. If only acres are given, still fill lotAcres and leave lotSf null — do not convert.
- parkingProvided is what the drawing says is PROVIDED; parkingRequired is what code REQUIRES. They differ, and both may appear in a parking table.
- surfaceParking: only if the drawing distinguishes surface stalls from structured/garage parking.
- confidence: how legible and unambiguous the source text was. Hand-lettered but clear = 0.8. Blurry or inferred layout = 0.3.
- foundSiteDataBlock: true only if you found an explicit data/summary block, as opposed to scattered callouts.`;

/**
 * Run vision extraction over rendered pages.
 * @returns { ok: true, data } | { ok: false, code, message }
 *
 * Uses Sonnet rather than Haiku deliberately: the highest-value source is a
 * hand-lettered SITE DATA block, and handwriting is where the cheaper model
 * misreads digits. A wrong unit count is worse than a slower call.
 */
export async function extractSiteData(images, anthropic, { model = 'claude-sonnet-4-6' } = {}) {
  if (!images?.length) return { ok: false, code: 'no_pages', message: 'Nothing to read.' };

  const content = [];
  for (const img of images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: img.png.toString('base64') },
    });
  }
  content.push({
    type: 'text',
    text: 'Read the project data written on this drawing. Remember: only report numbers that are actually written, and return null for anything that is not.',
  });

  let raw;
  try {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: SITE_VISION_SYSTEM,
      messages: [{ role: 'user', content }],
    });
    raw = msg.content[0]?.text ?? '';
  } catch (e) {
    console.error('site vision error:', e);
    return { ok: false, code: 'extraction_failed', message: 'Could not read the drawing.' };
  }

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    console.error('site vision — bad JSON:', raw.slice(0, 400));
    return { ok: false, code: 'bad_output', message: 'Could not read the extraction result.' };
  }

  return { ok: true, data: { ...validateSiteData(data), model } };
}

/**
 * Deterministic cross-checks on vision output.
 *
 * This is the safety net for misread digits, and it is not theoretical: at
 * 1600px the model reported totalUnits 264 while its own bed mix summed to 319.
 * The arithmetic disagreement is detectable for free, without a second model
 * call, and it caught the error every time it occurred in testing.
 *
 * Adds `warnings[]` and lowers `confidence`. Never silently rewrites a number —
 * a human decides which reading is right.
 */
export function validateSiteData(data) {
  const warnings = [];
  const mix = data.bedMix || {};
  const parts = ['studio', 'oneBed', 'twoBed', 'threeBed']
    .map(k => mix[k])
    .filter(v => typeof v === 'number');

  if (parts.length && typeof data.totalUnits === 'number') {
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== data.totalUnits) {
      warnings.push({
        field: 'totalUnits',
        message: `Bed mix sums to ${sum} but total units reads ${data.totalUnits}. One of them was misread — confirm against the drawing.`,
      });
    }
  }

  // Provided parking below required is legal (variances happen) but is far more
  // often a misread digit, so it is worth a look rather than silent acceptance.
  if (typeof data.parkingProvided === 'number' && typeof data.parkingRequired === 'number'
      && data.parkingProvided < data.parkingRequired) {
    warnings.push({
      field: 'parkingProvided',
      message: `Provided parking (${data.parkingProvided}) is below required (${data.parkingRequired}). Verify — this is usually a misread.`,
    });
  }

  // Ratio sanity. Multifamily runs roughly 1–2.5 stalls per unit; well outside
  // that range means a digit went missing or got added.
  if (typeof data.parkingProvided === 'number' && typeof data.totalUnits === 'number' && data.totalUnits > 0) {
    const ratio = data.parkingProvided / data.totalUnits;
    if (ratio < 0.3 || ratio > 4) {
      warnings.push({
        field: 'parkingProvided',
        message: `Parking works out to ${ratio.toFixed(2)} stalls per unit, outside the normal 0.3–4 range. Verify both numbers.`,
      });
    }
  }

  // Hand-lettered decimals were misread at EVERY resolution tested
  // (16.56 / 16.86 / 16.56 against a true 16.50), so acreage is never
  // presented as trustworthy on its own.
  if (typeof data.lotAcres === 'number') {
    warnings.push({
      field: 'lotAcres',
      message: 'Site acreage is read from a decimal that is frequently misread on hand-lettered drawings. Always confirm.',
    });
  }

  const confidence = warnings.length
    ? Math.min(data.confidence ?? 0.5, 0.45)
    : data.confidence;

  return { ...data, warnings, confidence };
}
