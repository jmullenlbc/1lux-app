/**
 * Shared drawing extraction core.
 *
 * ONE definition of "turn an uploaded drawing into structured unit data",
 * used by BOTH the authed project route and the public intake route. Written
 * this way deliberately: the same extraction prompt living in two files is how
 * you end up with the public tool and the internal tool disagreeing about the
 * same PDF. Same rule we apply to shared business numbers in `pipeline.js`.
 *
 * Everything here is project-less and DB-less — it takes a buffer and a
 * filename, and returns data. Nothing is persisted. That is what makes it
 * callable from an unauthenticated route where nothing should be written until
 * a human accepts the submission.
 */
import { loadPdfjs, pdfDocOptions } from './pdfjsNode.js';
// Relative, not `@/lib/...`, on purpose: scripts/tests/drawingExtract.test.mjs
// imports this file under plain Node, which does not know the `@/` alias.
import { buildUntrustedPrompt, warnOnInjection } from './agent/untrusted.js';

/** Files we can never read as text. */
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'];
export const ACCEPTED_EXTS = ['pdf', 'xlsx', 'xls'];

/**
 * Max characters handed to the model.
 *
 * This used to be a flat `slice(0, 12000)` from the head of the document, which
 * quietly failed on real drawing sets: a 789-page 100% SD set extracts to
 * ~191,000 characters, so we were sending the first 6% and silently discarding
 * everything else. If the unit matrix sat on page 400 it was never seen, and
 * the parse came back empty with no indication why.
 *
 * Now we select the most relevant windows instead of the first ones, and allow
 * a larger budget — still bounded, because every character is paid for.
 */
const MAX_CHARS = 30000;

/** Always keep this much of the head: cover sheets carry project totals. */
const HEAD_CHARS = 4000;

/** Window size for relevance scoring. Roughly a page of extracted drawing text. */
const WINDOW = 2000;

/**
 * Signals that a window contains unit-matrix / area data. Weighted because a
 * literal "UNIT MIX" heading is far stronger evidence than a stray "SF".
 */
const RELEVANCE_SIGNALS = [
  [/\bunit\s*(mix|matrix|schedule|breakdown|type)\b/gi, 25],
  [/\b(studio|efficiency)\b/gi, 6],
  [/\b\d\s*(br|bed|bedroom)\b/gi, 5],
  [/\b(gsf|nsf|nrsf|gia|rentable|net\s*area|gross\s*area)\b/gi, 6],
  // "total units" and "total SF" must be SEPARATE signals. Lumped together,
  // the common phrase ("TOTAL SF" appears on hundreds of sheets) wins the
  // coverage reservation and the rare decisive one ("TOTAL UNITS: 364",
  // appearing exactly twice in a 191k-char set) never gets selected.
  [/\btotal\s*(units?|d\.?u\.?)\b/gi, 30],
  [/\btotal\s*(sf|area|gsf|building)\b/gi, 8],
  [/\b\d{1,4}\s*(units?|d\.?u\.?)\b/gi, 8],
  [/\b(avg|average)\s*(unit)?\s*(sf|size)\b/gi, 6],
  [/\b\d{3,5}\s*sf\b/gi, 3],
];

/**
 * Pick the most relevant `maxChars` of a long extraction.
 *
 * Head-biased then relevance-ranked: the head is always kept (cover sheets and
 * summary tables live there), then the highest-scoring windows are added until
 * the budget is spent. Selected windows are re-emitted in DOCUMENT ORDER so
 * tables aren't scrambled, with an explicit gap marker so the model knows
 * material was skipped rather than assuming the text is contiguous.
 *
 * Short documents pass through untouched.
 */
export function selectRelevantText(text, maxChars = MAX_CHARS) {
  if (!text || text.length <= maxChars) return { text, truncated: false, keptPct: 100 };

  const head = text.slice(0, HEAD_CHARS);
  const rest = text.slice(HEAD_CHARS);

  const windows = [];
  for (let i = 0; i < rest.length; i += WINDOW) {
    const body = rest.slice(i, i + WINDOW);
    let score = 0;
    const hits = [];
    for (let s = 0; s < RELEVANCE_SIGNALS.length; s++) {
      const [re, weight] = RELEVANCE_SIGNALS[s];
      const m = body.match(re);
      if (!m) continue;
      // Cap repetition per signal. A drawing set repeats "1,200 SF" on hundreds
      // of sheets; without a cap those boilerplate windows outscore the one
      // window that actually says "TOTAL UNITS" and crowd it out entirely.
      // Observed on a real 789-page set: the totals window lost to 13 windows
      // full of repeated area callouts.
      score += Math.min(m.length, 3) * weight;
      hits.push(s);
    }
    windows.push({ start: i, body, score, hits });
  }

  const budget = maxChars - head.length;
  const chosen = [];
  const taken = new Set();
  let used = 0;

  function take(w) {
    if (taken.has(w.start) || used + w.body.length > budget) return false;
    taken.add(w.start);
    chosen.push(w);
    used += w.body.length;
    return true;
  }

  // Pass 1 — guarantee coverage. For each strong signal, reserve its single
  // best window first, so a rare-but-decisive phrase is never crowded out by
  // a pile of common ones.
  for (let s = 0; s < RELEVANCE_SIGNALS.length; s++) {
    if (RELEVANCE_SIGNALS[s][1] < 10) continue; // strong signals only
    const best = windows
      .filter(w => w.hits.includes(s))
      .sort((a, b) => b.score - a.score)[0];
    if (best) take(best);
  }

  // Pass 2 — fill the remaining budget by score.
  for (const w of [...windows].sort((a, b) => b.score - a.score)) {
    if (w.score === 0) break;           // nothing relevant left
    take(w);
  }

  chosen.sort((a, b) => a.start - b.start);

  let out = head;
  let cursor = -1;
  for (const w of chosen) {
    if (cursor !== -1 && w.start !== cursor) out += '\n[…]\n';
    out += w.body;
    cursor = w.start + w.body.length;
  }

  return {
    text: out,
    truncated: true,
    keptPct: Math.round((out.length / text.length) * 100),
    windowsKept: chosen.length,
    windowsTotal: windows.length,
  };
}

export function fileExt(name) {
  return String(name ?? '').split('.').pop()?.toLowerCase() ?? '';
}

/** Convert an XLSX/XLS buffer to flat CSV text, one block per sheet. */
export async function xlsxToText(buffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const lines = [];
  for (const name of wb.SheetNames) {
    lines.push(`=== Sheet: ${name} ===`);
    lines.push(XLSX.utils.sheet_to_csv(wb.Sheets[name]));
  }
  return lines.join('\n');
}

/**
 * Extract the text layer from a PDF buffer.
 *
 * NOTE: pdfjs resolves `standard_fonts/` at RUNTIME via a constructed path, so
 * nft cannot trace it. Every route that reaches this function must be listed in
 * `outputFileTracingIncludes` in next.config.mjs, or text extraction silently
 * returns nothing in production while working perfectly in local dev. This has
 * already broken prod once — `scripts/check-runtime-assets.mjs` guards it.
 */
export async function extractPdfText(buffer, maxPages = 60) {
  try {
    const pdfjsLib = await loadPdfjs();
    const doc = await pdfjsLib.getDocument(pdfDocOptions(buffer)).promise;
    let text = '';
    const pages = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= pages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n';
    }
    const trimmed = text.trim();
    return trimmed.length > 50 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Turn an uploaded file into text.
 * @returns { ok: true, text } | { ok: false, code, message }
 *
 * Codes are stable and safe to show a public user:
 *   unsupported_type | image_not_supported | no_text_layer
 */
export async function extractDrawingText(buffer, fileName) {
  const ext = fileExt(fileName);

  if (IMAGE_EXTS.includes(ext)) {
    return {
      ok: false, code: 'image_not_supported',
      message: 'Image files can\'t be read yet. Please upload the original PDF or an Excel file.',
    };
  }

  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const text = await xlsxToText(buffer);
      if (!text || text.trim().length < 30) {
        return { ok: false, code: 'no_text_layer', message: 'That spreadsheet appears to be empty.' };
      }
      return { ok: true, text };
    } catch {
      return { ok: false, code: 'no_text_layer', message: 'That spreadsheet could not be read.' };
    }
  }

  if (ext === 'pdf') {
    const text = await extractPdfText(buffer);
    if (!text || text.trim().length < 30) {
      // Overwhelmingly this means a scanned/plotted drawing with no text layer —
      // very common for site plans. Say so plainly rather than "parse failed".
      return {
        ok: false, code: 'no_text_layer',
        message: 'This PDF has no readable text layer (it looks like a scan or an image-only plot). Please upload a vector PDF or the unit matrix as Excel.',
      };
    }
    return { ok: true, text };
  }

  return {
    ok: false, code: 'unsupported_type',
    message: 'Unsupported file type. Please upload a PDF or Excel file.',
  };
}

// ─── AI EXTRACTION ──────────────────────────────────────────────────────────

export const EXTRACT_SYSTEM = `You are a structured data extractor for architectural unit matrix documents.
Extract the residential unit type breakdown from the provided text. Ignore drawing indices, abbreviation
legends, revision notes, and anything unrelated to unit types and square footage.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "unitTypes": [
    {
      "code": "string (e.g. 2BR-K)",
      "label": "string or null",
      "qty": number,
      "unitSf": number or null,
      "bedrooms": number or null,
      "bathrooms": number or null,
      "balconies": number or null,
      "confidence": number (0.0–1.0)
    }
  ],
  "projectTotals": {
    "grossInteriorSf": number or null,
    "garageSf": number or null,
    "corridorSf": number or null,
    "buildingType": "string or null"
  },
  "granularity": "PER_UNIT or PER_TYPE or PROJECT_TOTAL_ONLY",
  "overallConfidence": number (0.0–1.0),
  "notes": "string describing anything ambiguous"
}

Rules:
- Per-type matrices: each row is a unit type with a quantity. Roll up in your head to verify totals.
- Per-unit matrices: each row is one unit; group them by type code.
- Bedrooms: use the bedroom column if present; otherwise infer from the type code (e.g. "2BR" → 2, "1BR" → 1, "STUDIO" → 0).
- confidence per row: how confident you are in this row's data. 1.0 = exact numbers clearly stated; 0.5 = inferred/ambiguous.
- If a column is missing entirely, set that field to null for all rows — do not guess.
- grossInteriorSf: look for GSF, NRSF, GIA, "Total SF", or a summary total line. Only populate if explicitly stated.`;

/** Haiku handles clean tables; dense or "combined" sheets get Sonnet. */
export function pickModel(text, fileName) {
  const n = String(fileName ?? '').toLowerCase();
  const noisy = text.length > 6000 || n.includes('full') || n.includes('combined');
  return noisy ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
}

/**
 * Run the unit-matrix extraction.
 * @returns { ok: true, proposal } | { ok: false, code, message }
 * Codes: extraction_failed | bad_output
 */
export async function parseUnitMatrix(text, fileName, anthropic, ctx = {}) {
  const sel = selectRelevantText(text, MAX_CHARS);
  const truncated = sel.text;
  if (sel.truncated) {
    console.log(`[drawingExtract] ${fileName}: ${text.length} chars -> ${truncated.length} (${sel.keptPct}%), kept ${sel.windowsKept}/${sel.windowsTotal} windows`);
  }
  const model = pickModel(truncated, fileName);

  // This function is reachable from the PUBLIC intake route — anyone on the
  // internet can hand it a PDF, and the filename is theirs too. That makes it the
  // single most exposed model call in the app, so the drawing text goes inside a
  // fence rather than after a colon. See src/lib/agent/untrusted.js.
  const sealed = buildUntrustedPrompt({
    instructions: 'Extract the unit matrix from the document below.',
    system:       EXTRACT_SYSTEM,
    documents:    [{ text: truncated, descriptor: fileName || 'drawing', maxChars: MAX_CHARS }],
  });
  warnOnInjection('unitMatrix.parse', ctx.projectId, sealed);

  let raw;
  try {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: sealed.system,
      messages: [{ role: 'user', content: sealed.content }],
    });
    raw = msg.content[0]?.text ?? '';
  } catch (e) {
    console.error('unit matrix extraction error:', e);
    return { ok: false, code: 'extraction_failed', message: 'Extraction failed. Please try again.' };
  }

  // Strip code fences defensively — models add them despite instructions.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('unit matrix — bad JSON:', raw.slice(0, 500));
    return { ok: false, code: 'bad_output', message: 'Could not read the extraction result.' };
  }

  if (!Array.isArray(parsed.unitTypes)) {
    return { ok: false, code: 'bad_output', message: 'Unexpected extraction shape.' };
  }

  return { ok: true, proposal: { ...parsed, model } };
}

// ─── MERGING MULTIPLE DRAWINGS ──────────────────────────────────────────────

// `mergeProposals` moved to its own module because the intake dropzone is a
// CLIENT component and needs it, while this file reaches the model and pulls in
// `node:crypto` via the injection boundary. Re-exported so every existing
// server-side importer and the unit test keep working unchanged.
export { mergeProposals } from './mergeProposals.js';
