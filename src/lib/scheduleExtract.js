import './pdfPolyfill.js';
import { loadPdfjs } from './pdfjsNode.js';
/**
 * scheduleExtract.js — robust construction-schedule milestone extraction.
 *
 * Built for large, multi-building MS Project / P6 exports (e.g. Zenith on 25th:
 * 96 pages, 1,800+ rows, 5 buildings, the full sequence repeated per building
 * with the final Turnover/TCO ~130k chars deep).
 *
 * Three improvements over the old inline parser:
 *  1. ROW-STRUCTURED text — group PDF text items by Y position so each schedule
 *     row ("108 Meps trades 10 days Tue 1/12/27 ...") is one clean line, instead
 *     of a run-on blob. Far more reliable for both the AI and the fallback.
 *  2. WHOLE document — read all pages and send the full row text (Haiku's 200k
 *     context easily fits ~160k chars), so project-level start/end aren't cut off.
 *  3. DETERMINISTIC FALLBACK — if the AI returns nothing, a keyword+date scanner
 *     still pulls the core milestones, so a recognizable schedule never yields [].
 */
import { getAnthropicKey } from './anthropicKey.js';
import { buildUntrustedPrompt, warnOnInjection } from './agent/untrusted.js';
import path from 'path';
import { createRequire } from 'module';

// Resolve pdfjs's bundled standard fonts (same setup as the working ocr.js path).
// Without this, getTextContent can throw in a serverless runtime.
let FONTS_URL = null;
try {
  const req = createRequire(import.meta.url);
  FONTS_URL = `file://${path.dirname(req.resolve('pdfjs-dist/package.json'))}/standard_fonts/`.replace(/\\/g, '/');
} catch {}

// ── Row-structured PDF text ───────────────────────────────────────────────────
// Returns { text, numPages, pagesRead, error } so callers can surface a precise
// diagnostic (we can't read prod logs) instead of a generic "no text".
export async function extractScheduleTextDiag(buffer, maxPages = 120) {
  let numPages = 0, pagesRead = 0, error = null;
  try {
    const pdfjsLib = await loadPdfjs();
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      ...(FONTS_URL ? { standardFontDataUrl: FONTS_URL } : {}),
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    }).promise;
    numPages = doc.numPages;
    let text = '';
    const n = Math.min(numPages, maxPages);
    for (let i = 1; i <= n; i++) {
      try {
        const content = await (await doc.getPage(i)).getTextContent();
        const byY = new Map();
        for (const it of content.items) {
          const y = Math.round(it.transform[5]);
          if (!byY.has(y)) byY.set(y, []);
          byY.get(y).push({ x: it.transform[4], s: it.str });
        }
        const rows = [...byY.entries()]
          .sort((a, b) => b[0] - a[0]) // top→bottom
          .map(([, items]) => items.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim())
          .filter(r => r);
        text += rows.join('\n') + '\n';
        pagesRead++;
      } catch (pe) { error = `page ${i}: ${pe?.message ?? pe}`; }
    }
    try { await doc.destroy(); } catch {}
    const t = text.trim();
    return { text: t.length > 50 ? t : null, numPages, pagesRead, error };
  } catch (e) {
    return { text: null, numPages, pagesRead, error: e?.message ?? String(e) };
  }
}

export async function extractScheduleText(buffer, maxPages = 120) {
  return (await extractScheduleTextDiag(buffer, maxPages)).text;
}

// ── Dates ─────────────────────────────────────────────────────────────────────
function toIso(m, d, y) {
  if (m === undefined || m === null) return null;   // unrecognised 3-letter month
  let yr = parseInt(y); if (yr < 100) yr += 2000;
  const mo = parseInt(m), dy = parseInt(d);
  if (yr < 2020 || yr > 2040 || mo < 1 || mo > 12 || dy < 1 || dy > 31) return null;
  return `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
}
const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

/**
 * Two date shapes, because GCs export from two different tools:
 *   M/D/YY      — MS Project / Excel exports
 *   DD-Mon-YY   — Primavera P6, which is what most large GCs actually send
 *                 ("07-Oct-24 A", "26-Aug-27*" — the A and asterisk are P6's
 *                 actual/constraint markers, not part of the date)
 *
 * Only the slash form was matched until 2026-08-19, so on a P6 schedule this
 * pass found its keyword rows, found no date on them, and returned zero
 * milestones. It is meant to be the floor that survives an AI timeout — on the
 * commonest schedule format the floor was nothing.
 *
 * One regex with an alternation, scanned left to right, so results stay in
 * COLUMN order: callers rely on [start, finish].
 */
function datesInRow(row) {
  const out = [];
  const re = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b|\b(\d{1,2})-([A-Za-z]{3})-(\d{2,4})\b/g;
  let m;
  while ((m = re.exec(row))) {
    const iso = m[1] !== undefined
      ? toIso(m[1], m[2], m[3])                        // M/D/YY
      : toIso(MONTHS[m[5].toLowerCase()], m[4], m[6]); // DD-Mon-YY
    if (iso) out.push(iso);
  }
  return out; // [start, finish, ...] in column order
}

// ── AI extraction (whole schedule) ────────────────────────────────────────────
const SINGLETON_IDS = new Set(['construction-start', 'light-fixtures', 'site-lighting', 'electrical-devicing', 'tco', 'construction-end']);
const MULTI_RE = /^(electrical-rough|mep-rough)-\d+$/;

const PROMPT_HEAD = `You are reading a construction schedule (Primavera P6, MS Project, Excel, or similar Gantt export). It may be a MULTI-BUILDING / multi-phase schedule where the same sequence repeats per building or tower.

Extract milestone dates and return ONLY a valid JSON array — no markdown, no explanation.
Return format: [{"id":"milestone-id","label":"Milestone Label","date":"YYYY-MM-DD"}, ...]

Milestone types:

• "construction-start" — the EARLIEST project start: NTP, Notice to Proceed, Mobilization, project start, first day of construction. ONE entry, the earliest date. "A" (Actual) dates count.

• "electrical-rough-1","electrical-rough-2",... — Electrical rough-in / overhead electrical / in-wall electrical, per building or floor. Use the EARLIEST start for each. Sort ascending, number sequentially, label with the building/floor (e.g. "Electrical Rough-In — Bldg A"). Exclude switchgear, panelboard, fire alarm, underground/conduit, transformers.

• "mep-rough-1","mep-rough-2",... — MEP rough-in. In this schedule MEP rough is often named "Meps trades", "Meps Trades First floor", "Meps trades second/third floor". Treat all of those as MEP rough-in. One entry per building/floor grouping, earliest start, numbered ascending, labelled with the building/floor.

• "light-fixtures" — light fixture / lighting install (interior). Exclude site/exterior lighting.
• "site-lighting" — site/exterior/parking-lot lighting, bollards.
• "electrical-devicing" — electrical devicing / trims / electrical trim.

• "tco" — Temporary Certificate of Occupancy ("TCO release", "Temp C/O"). For a multi-building schedule use the LATEST (final building's) TCO. ONE entry.

• "construction-end" — project completion: "Turnover Keys", "Owners Walk", Final Completion, Substantial Completion, owner move-in, closeout. For a multi-building schedule use the LATEST finish across ALL buildings. ONE entry.

Rules:
- Only milestones explicitly in the schedule — never invent dates.
- Dates are usually "Day M/D/YY"; the FIRST date in a row is its start, the second is its finish. Use the start for start-type milestones and the finish for completion-type (tco, construction-end).
- Return [] only if there are truly no recognizable milestones.
`;

export async function aiExtractMilestones(text, anthropic, ctx = {}) {
  if (!text) return [];

  // The rows are the GC's schedule export. They used to be concatenated onto the
  // end of PROMPT_HEAD under a "Schedule rows:" label — one string, two authors.
  // See src/lib/agent/untrusted.js. 180k chars is a lot of stranger-written text
  // to hand a model, which is exactly why it needs the fence rather than despite it.
  const sealed = buildUntrustedPrompt({
    instructions: PROMPT_HEAD,
    documents:    [{ text, descriptor: 'construction schedule', maxChars: 180000 }],
  });
  warnOnInjection('schedule.construction.parse', ctx.projectId, sealed);

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    system:   sealed.system,
    messages: [{ role: 'user', content: sealed.content }],
  });
  const raw = msg.content.map(b => b.text || '').join('');
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  if (s === -1 || e === -1) return [];
  let parsed; try { parsed = JSON.parse(raw.slice(s, e + 1)); } catch { return []; }
  return parsed.filter(m =>
    m.id && m.label && /^\d{4}-\d{2}-\d{2}$/.test(m.date) &&
    parseInt(m.date) >= 2020 && parseInt(m.date) <= 2035 &&
    (SINGLETON_IDS.has(m.id) || MULTI_RE.test(m.id))
  );
}

// ── Deterministic fallback (keyword + date scan over rows) ─────────────────────
const KW = {
  start: [/\bNTP\b/i, /notice to proceed/i, /mobiliz/i, /construction start/i],
  // Both orders: schedules write "MEP Rough-In" and "Rough-In MEP" about equally.
  // Deliberately still requires the word "rough" — matching bare "Electrical"
  // would sweep up "Trench For Electrical" and "Submittals - Electrical Gear",
  // which are not rough-ins.
  mep:   [/meps?\s+trades/i, /\bMEP\b[\s-]*rough/i, /rough[\s-]*in\s+meps?\b/i, /mechanical rough/i, /overhead mechanical/i],
  elec:  [/electrical rough/i, /rough[\s-]*in\s+electrical/i, /overhead electrical/i],
  tco:   [/\bTCO\b/i, /temp(?:orary)? c\.?o\.?/i, /temporary certificate of occupanc/i],
  end:   [/turnover keys/i, /owners?\s+walk/i, /final completion/i, /substantial completion/i, /owner move/i],
};
const matches = (row, res) => res.some(re => re.test(row));

export function keywordExtractMilestones(text) {
  if (!text) return [];
  const rows = text.split('\n');
  const startDs = [], mepDs = [], elecDs = [], tcoDs = [], endDs = [];
  for (const row of rows) {
    const ds = datesInRow(row);
    if (!ds.length) continue;
    if (matches(row, KW.start)) startDs.push(ds[0]);
    if (matches(row, KW.mep))   mepDs.push(ds[0]);
    if (matches(row, KW.elec))  elecDs.push(ds[0]);
    if (matches(row, KW.tco))   tcoDs.push(ds[ds.length - 1]); // finish
    if (matches(row, KW.end))   endDs.push(ds[ds.length - 1]); // finish
  }
  const start = startDs.length ? startDs.sort()[0] : null;
  // Rough-ins must fall on/after construction start — drops design/submittal-phase
  // "MEP"/"electrical" references (e.g. 2025 utility design rows).
  const floor = start || '2020-01-01';
  const roughs = ds => [...new Set(ds.filter(d => d >= floor))].sort();

  const out = [];
  if (start) out.push({ id: 'construction-start', label: 'Construction Start', date: start });
  roughs(elecDs).slice(0, 15).forEach((d, i) => out.push({ id: `electrical-rough-${i + 1}`, label: `Electrical Rough-In ${i + 1}`, date: d }));
  roughs(mepDs).slice(0, 15).forEach((d, i) => out.push({ id: `mep-rough-${i + 1}`, label: `MEP Rough-In ${i + 1}`, date: d }));
  if (tcoDs.length) out.push({ id: 'tco', label: 'TCO', date: tcoDs.sort().at(-1) });
  if (endDs.length) out.push({ id: 'construction-end', label: 'Final Completion', date: endDs.sort().at(-1) });
  return out;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Always returns a usable result within a serverless budget:
 *  - deterministic keyword pass is the instant, timeout-proof FLOOR,
 *  - AI pass (bounded by a timeout) ENHANCES it (accurate per-building rough-ins,
 *    better labels) and wins when it returns a fuller set.
 * So an AI/network hiccup or Lambda timeout can never blank the dates.
 */
export async function extractScheduleMilestones(buffer, anthropic, { aiTimeoutMs = 22000, ...ctx } = {}) {
  const { text, numPages, pagesRead, error } = await extractScheduleTextDiag(buffer);
  const diag = { numPages, pagesRead, error, textLen: text?.length ?? 0 };
  if (!text) return { text: null, milestones: [], source: 'none', diag };
  return milestonesFromText(text, anthropic, { aiTimeoutMs, ...ctx }, diag);
}

/**
 * Same two-tier extraction, but starting from row text we already have.
 * Used when the original PDF is no longer on disk (each Lambda instance has its
 * own ephemeral filesystem, so an uploaded file is unreadable minutes later) but
 * ProjectFile.textContent from the upload-time parse survived in the database.
 */
export async function extractScheduleMilestonesFromText(text, anthropic, { aiTimeoutMs = 22000, ...ctx } = {}) {
  if (!text || text.trim().length < 50) {
    return { text: null, milestones: [], source: 'none', diag: { fromStoredText: true, textLen: text?.length ?? 0 } };
  }
  return milestonesFromText(text, anthropic, { aiTimeoutMs, ...ctx }, { fromStoredText: true, textLen: text.length });
}

async function milestonesFromText(text, anthropic, { aiTimeoutMs = 22000, ...ctx } = {}, diag = {}) {
  const keyword = keywordExtractMilestones(text);

  let ai = [];
  try { ai = await withTimeout(aiExtractMilestones(text, anthropic, ctx), aiTimeoutMs, 'AI extraction'); }
  catch (e) { console.error('[extractScheduleMilestones] AI skipped:', e?.message ?? e); diag.aiError = e?.message ?? String(e); }

  // Prefer AI when it returns a fuller set; otherwise the reliable keyword floor.
  if (ai.length >= keyword.length && ai.length >= 2) return { text, milestones: ai, source: 'ai', diag };
  if (keyword.length) return { text, milestones: keyword, source: 'keyword', diag };
  return { text, milestones: ai, source: ai.length ? 'ai' : 'none', diag };
}
