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
// Relative, not `@/lib/...`, on purpose: scripts/tests/drawingExtract.test.mjs
// imports this file under plain Node, which does not know the `@/` alias.
import { buildUntrustedPrompt, warnOnInjection } from './agent/untrusted.js';
import { modelParams, textFrom, answerBudget, warnIfTruncated } from './aiModels.js';
import { loadPdfjs, pdfDocOptions } from './pdfjsNode.js';
import { findAreaSheets, resolveGrossSf, focusAroundNumber, sheetNumberOf } from './areaSheet.js';

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
  // Area-sheet signals. Weighted ABOVE the generic area phrases above because
  // finding the sheet is only half the job — the window carrying the net/gross
  // label has to survive into the 30k budget, or `classifyAreaBasis` gets handed
  // text that never mentioned the basis and correctly answers "unknown".
  [/\b(program|area)\s*breakdown\b/gi, 30],
  [/\bbuilding\s*(gross|statistics)\b/gi, 28],
  [/\barea\s*(schedule|summary|tabulation|plan)\b/gi, 22],
  [/\b(actual|allowable)\s*area\b/gi, 12],
  [/\b(boh|back\s*of\s*house|amenity|foh|stairwell)\b/gi, 6],
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
export async function extractPdfPages(source, opts = {}) {
  const {
    maxPages = MAX_PDF_PAGES,
    timeBudgetMs = PDF_SCAN_BUDGET_MS,
    shouldStop,
    fromPage = 1,
    // Last page this call may read, inclusive. Set only by a parallel scan
    // shard, which owns one contiguous stretch of a big set; everything else
    // reads to the end as it always did.
    toPage = null,
  } = opts;
  const started = Date.now();

  try {
    // `source` is either the file's bytes or a pdfjs document someone else
    // already opened. The second form is what makes 400 MB sets readable: the
    // caller opens them by byte range (see pdfRange.js) so the whole file is
    // never in memory, and hands us the doc. Everything below is identical
    // either way — a doc is a doc.
    const doc = isPdfDoc(source)
      ? source
      : await (await loadPdfjs()).getDocument(pdfDocOptions(source)).promise;

    const limit = Math.min(doc.numPages, maxPages, toPage ?? Infinity);
    const pages = [];
    let stoppedEarly = false;

    // The first page this call has NOT read. A staged read resumes from it, so
    // it has to move forward on every outcome except one -- see the catch.
    let nextPage = fromPage;

    // True when the read was cut short by the memory/byte brake rather than by
    // this slice running out of time. The two are NOT the same thing and the
    // caller must not confuse them -- see `nextPage` in the return below.
    let braked = false;

    for (let i = fromPage; i <= limit; i++) {
      // `i > fromPage`, deliberately: every slice must attempt at least one
      // page. Opening a big set by byte range can itself eat the whole slice
      // budget, and a slice that reads nothing hands back the same `nextPage`
      // it was given -- so the browser asks again, gets nothing again, and the
      // read never finishes. One page per slice is the floor that guarantees
      // the loop always moves forward.
      if (i > fromPage && Date.now() - started > timeBudgetMs) { stoppedEarly = true; break; }
      // A second brake, used by the ranged reader: stop once we have pulled
      // more bytes than we are willing to hold. Time alone is not enough — a
      // fast connection can drag a 400 MB set into memory well inside the time
      // budget, which is the exact failure this whole path exists to prevent.
      //
      // No first-page exemption here, unlike the time check above: a read that
      // is ALREADY out of room must not read one more page to prove it. It
      // still cannot spin, because a braked read is finished, not paused.
      if (shouldStop?.()) { stoppedEarly = true; braked = true; break; }

      // Bounded, because a page read can hang rather than fail. When pages are
      // fetched by byte range, pdfjs asks storage for bytes and then waits for
      // them with no timeout of its own — so one bad fetch parks here forever
      // and the budget check above, which only runs BETWEEN pages, never gets
      // another turn. Whatever pages we already have are worth more than a
      // request that dies on a Lambda timeout with nothing to show.
      const left = timeBudgetMs - (Date.now() - started);
      // The mandatory page — the one every slice must attempt — always gets a
      // full-size window, even when the slice's budget arrived shrunken (a
      // staged read charges the file-open time against it). The step-over rule
      // below treats "timed out with nothing read" as a broken page, and that
      // judgement is only fair after a real attempt; on a short window it
      // would silently skip a perfectly good page.
      const window = pages.length === 0 ? Math.max(left, 12_000) : left;
      let page;
      try {
        // getPage is INSIDE the race, not before it: resolving a page's
        // dictionary is itself a run of range fetches, and on the Skyline
        // Ridge set one page's fetches sat past the front door's ~28s with
        // the old race guarding only getTextContent. The window has to cover
        // everything between "ask for the page" and "have its text".
        const content = await Promise.race([
          (async () => {
            page = await doc.getPage(i);
            return page.getTextContent();
          })(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('page read timed out')), window).unref?.()),
        ]);
        pages.push({ page: i, text: content.items.map(it => it.str).join(' ') });
        nextPage = i + 1;
      } catch (e) {
        stoppedEarly = true;
        // A page that ran out of THIS call's budget is not a broken page: a
        // staged read gets a fresh budget on the next request and should try it
        // again. A page that failed for any other reason never will, and one
        // that times out having read nothing would resume onto itself forever.
        // Both have to be stepped over or the scan can never finish.
        if (e?.message !== 'page read timed out' || pages.length === 0) nextPage = i + 1;
        break;
      } finally {
        // Release the parsed page. Without this, scanning a full set keeps
        // every page's operator list and fonts alive at once, and memory
        // tracks the size of the SET rather than the size of one page.
        try { page?.cleanup(); } catch {}
      }
    }

    return {
      pages,
      totalPages: doc.numPages,
      scannedPages: pages.length,
      // What is left to read, or null when there is nothing more to ask for.
      // Two ways to be finished:
      //   - the document ran out. Measured against `limit`, not numPages: past
      //     maxPages there is no more on offer, so asking again would spin.
      //   - the brake came on. Another slice would re-open the file, meet the
      //     same memory pressure and stop in the same place, forever. Running
      //     out of TIME is resumable; running out of ROOM is not, and the
      //     sheets worth having are at the front of the set anyway.
      nextPage: braked || nextPage > limit ? null : nextPage,
      braked,
      stoppedEarly: stoppedEarly || limit < doc.numPages,
      ms: Date.now() - started,
    };
  } catch {
    return { pages: [], totalPages: 0, scannedPages: 0, nextPage: null, braked: false, stoppedEarly: false, ms: Date.now() - started };
  }
}

/**
 * Page budget.
 *
 * Was a flat 60 for a long time, which quietly capped every large set: the
 * Fox Park 100% DD set is 442 pages, so 86% of it was never read. Two bounds
 * now, and the time one is the real one — a 400-page cap that takes four minutes
 * is a timeout, not a feature. Whichever hits first wins, and the caller is told
 * via `stoppedEarly` so it can say so instead of silently returning less.
 *
 * The good news for area sheets specifically: they live at the FRONT of a set.
 * Fox Park's G0.02 "Building Statistics" is page 3 of 442. Head-first scanning
 * finds them almost immediately; the budget only matters for unit matrices,
 * which can sit anywhere.
 */
export const MAX_PDF_PAGES = 400;
const PDF_SCAN_BUDGET_MS = 20000;

/** True for an already-open pdfjs document, as opposed to raw bytes. */
export function isPdfDoc(x) {
  return !!x && typeof x === 'object' && typeof x.getPage === 'function' && typeof x.numPages === 'number';
}

export async function extractPdfText(buffer, maxPages = MAX_PDF_PAGES) {
  const { pages } = await extractPdfPages(buffer, { maxPages });
  const trimmed = pages.map(p => p.text).join('\n').trim();
  return trimmed.length > 50 ? trimmed : null;
}

/**
 * Turn an uploaded file into text.
 * @returns { ok: true, text } | { ok: false, code, message }
 *
 * Codes are stable and safe to show a public user:
 *   unsupported_type | image_not_supported | no_text_layer
 */
export async function extractDrawingText(buffer, fileName, opts = {}) {
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
    const slice = await extractPdfPages(buffer, opts);

    // A staged read hands back the pages it banked on earlier requests, because
    // no single request is allowed to run long enough to read a big set in one
    // go. Every judgement below is about the WHOLE document, so it is made on
    // the combined list rather than on this one slice.
    const pages = opts.priorPages?.length ? [...opts.priorPages, ...slice.pages] : slice.pages;
    const scan = { ...slice, pages, scannedPages: pages.length };

    // "Does this set have a text layer" cannot be answered from a partial read.
    // A 158-sheet set whose first forty sheets are title blocks would be called
    // blank, and we would give up on a drawing we had barely opened.
    if (scan.nextPage) return { ok: false, partial: true, code: 'more_pages', scan };

    const text = pages.map(p => p.text).join('\n').trim();
    if (!text || text.trim().length < 30) {
      // Overwhelmingly this means a scanned/plotted drawing with no text layer —
      // very common for site plans. Say so plainly rather than "parse failed".
      //
      // `scan` rides along but `pages` deliberately does not: a caller that is
      // handed a page list treats it as a sheet index worth spending a model
      // call on, and every one of these pages is blank.
      return {
        ok: false, code: 'no_text_layer', scan,
        message: 'This PDF has no readable text layer (it looks like a scan or an image-only plot). Please upload a vector PDF or the unit matrix as Excel.',
      };
    }
    // `pages` rides along so the caller can find the area sheet without paying
    // to extract the PDF a second time. See src/lib/areaSheet.js.
    return { ok: true, text, pages, scan };
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

Hotels: treat KEYS exactly like units. A hotel room matrix (KING, QUEEN/QUEEN, suites, with key counts)
IS a unit matrix — room types are unit types, key quantities are unit quantities, and a printed
"TOTAL KEYS" or "KEY COUNT" is the statedTotalUnits.

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
    "grossSfLabel": "string or null",
    "grossSfSheet": "string or null",
    "garageSf": number or null,
    "corridorSf": number or null,
    "statedTotalUnits": number or null,
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
- grossInteriorSf: the best STATED whole-building square footage on the document. Prefer, in order:
  (1) a program/area breakdown total ("BUILDING GROSS SF"), (2) a cover-sheet or code-summary grand
  total ("TOTAL BUILDING GSF", "GBA", "ACTUAL AREA"), (3) a room/unit schedule total. Do NOT add up
  per-floor areas yourself — report only what is printed.
- grossSfLabel: the LITERAL heading printed above or beside that number, copied exactly as it appears
  — "BUILDING GROSS SF", "TOTAL ACTUAL AREA", "NET RENTABLE", "AVG AREA". Copy it verbatim, including
  abbreviations and punctuation. Do not normalise, expand, or interpret it.
  This matters more than it looks: architects publish the same building at three different totals
  (net room polygons, code area inside the exterior walls, and true gross to the outside face) and
  they differ by 5–8%. Downstream code decides which one this is FROM THIS LABEL, so a paraphrased
  label is worse than no label. If nothing is printed near the number, return null — never invent one.
- grossSfSheet: the sheet number that figure came from (e.g. "G0.02", "A-811", "LS0.01"), or null.
- statedTotalUnits: the total unit count as PRINTED on the document ("TOTAL UNITS: 364", a matrix total row,
  a cover-sheet project summary). Do NOT add up the rows yourself to fill this in — null is the correct answer
  when the document does not state a total. This field exists so the row quantities can be checked against
  the document, and a value you computed cannot check anything.`;

/**
 * Bump this whenever EXTRACT_SYSTEM changes.
 *
 * Step 18 keys a task type's accuracy history to the prompt version, so a
 * rewritten prompt starts back at Tier 0 rather than inheriting a record it
 * never earned. Editing the prompt without touching this line is the one way
 * to break that, which is why the constant lives here, next to the prompt,
 * rather than at the call sites.
 */
export const EXTRACT_PROMPT_VERSION = 'unitMatrix-2026-08-18';

/**
 * Which JOB this drawing is, in src/lib/aiModels.js terms.
 *
 * A clean unit-matrix table is a small, bounded read. A dense or "combined" set
 * is the case Mike means by "for drawings it is so much more accurate" — the
 * numbers are buried in a wall of sheet text, and that is where the big reader
 * earns its cost. The split is unchanged; only the two models it selects moved
 * up a tier, and they now live in one table instead of in this line.
 */
export function pickJob(text, fileName) {
  const n = String(fileName ?? '').toLowerCase();
  const noisy = text.length > 6000 || n.includes('full') || n.includes('combined');
  return noisy ? 'drawing.unitMatrix' : 'drawing.unitMatrix.clean';
}

/** The model id chosen for a drawing — kept for logging and for the tests. */
export function pickModel(text, fileName) {
  return modelParams(pickJob(text, fileName)).model;
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
  const job    = pickJob(truncated, fileName);
  const params = modelParams(job);
  const model  = params.model;

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
      ...params,
      max_tokens: answerBudget(job, 2048),
      system: sealed.system,
      messages: [{ role: 'user', content: sealed.content }],
    });
    warnIfTruncated(msg, job);
    raw = textFrom(msg) ?? '';
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

  const proposal = attachAreaBasis({ ...parsed, model }, { pages: ctx.pages, text: truncated });
  return { ok: true, proposal };
}

/**
 * Decide whether the extracted square footage is gross, net, or code area, and
 * correct it if it isn't gross.
 *
 * Split out from the model call on purpose. The model's job is to read numbers
 * off a table; deciding what a number MEANS is a fixed-label lookup that regex
 * does perfectly, for free, identically every time, and can show its work. See
 * the header of src/lib/areaSheet.js for the measured 5–8% this is worth.
 *
 * Mutates nothing — returns a new proposal.
 */
export function attachAreaBasis(proposal, { pages, text } = {}) {
  const totals = proposal?.projectTotals;
  if (!totals) return proposal;

  const candidates = Array.isArray(pages) && pages.length ? findAreaSheets(pages, 3) : [];
  const byPage = new Map((pages ?? []).map(p => [p.page, p.text]));
  const stated = Number(totals.grossInteriorSf);

  // Which sheet do we judge? The one the number is actually printed on.
  //
  // Concatenating all three candidates was wrong: it blends up to three
  // different bases into one string and the verdict becomes an average of pages
  // that have nothing to do with each other. Whichever candidate carries this
  // number is the one whose wording applies to it.
  let sourcePage = null;
  if (Number.isFinite(stated) && stated > 0) {
    sourcePage = candidates.find(c => focusAroundNumber(byPage.get(c.page) ?? '', stated)) ?? null;
    if (!sourcePage) {
      // Not on any candidate sheet — check the rest of the set before giving up.
      const anywhere = (pages ?? []).find(p => focusAroundNumber(p.text ?? '', stated));
      if (anywhere) sourcePage = { page: anywhere.page, sheetNo: sheetNumberOf(anywhere.text), offSheet: true };
    }
  }

  // What the classifier reads, most trustworthy first:
  //   1. the label the model copied off the sheet — the closest thing to a
  //      direct quote of the number's own heading,
  //   2. the page the number is printed on,
  //   3. the best-scoring area sheet, when we could not locate the number,
  //   4. the selected extract, as a fallback when we have no page breakdown
  //      (Excel uploads, and the internal route's pre-extracted textContent).
  const pageText = sourcePage
    ? byPage.get(sourcePage.page) ?? ''
    : (candidates.length ? byPage.get(candidates[0].page) ?? '' : (text ?? ''));
  const basisText = [totals.grossSfLabel ?? '', pageText].join('\n');

  const resolved = resolveGrossSf(totals.grossInteriorSf, basisText, {
    buildingType: totals.buildingType,
  });

  // Found the sheet but could not read the table. BECK's A-811 program breakdown
  // scores 90 and yields nothing: the table is vector art, so only the Revit
  // layer names survive as text. Saying "no area sheet" would be false and saying
  // nothing would be worse — the reviewer is told which sheet to open by hand.
  const unreadable = candidates.length > 0 && candidates.every(c => !c.readable);

  return {
    ...proposal,
    projectTotals: {
      ...totals,
      grossInteriorSf: resolved.value,
      grossSfStated:     resolved.statedValue,
      grossSfBasis:      resolved.basis,
      grossSfConfidence: resolved.confidence,
      grossSfAdjusted:   resolved.adjusted,
      grossSfNeedsReview: resolved.needsReview || unreadable,
      grossSfNote:       resolved.note,
      // Both screens append "Read from sheet X." after this, so it is left out here.
      grossSfSummary:    unreadable
        ? 'The area sheet is a picture, not text — its table could not be read. ' +
          'Please check the square footage against that sheet.'
        : resolved.summary,
      grossSfUnreadable: unreadable,
      grossSfSheet:      totals.grossSfSheet ?? sourcePage?.sheetNo ?? candidates[0]?.sheetNo ?? null,
    },
    areaSheets: candidates,
  };
}

// ─── MERGING MULTIPLE DRAWINGS ──────────────────────────────────────────────

// `mergeProposals` moved to its own module because the intake dropzone is a
// CLIENT component and needs it, while this file reaches the model and pulls in
// `node:crypto` via the injection boundary. Re-exported so every existing
// server-side importer and the unit test keep working unchanged.
export { mergeProposals } from './mergeProposals.js';
