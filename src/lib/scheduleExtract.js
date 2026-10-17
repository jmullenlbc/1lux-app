import './pdfPolyfill.js';
import { loadPdfjs } from './pdfjsNode.js';
/**
 * scheduleExtract.js, robust construction-schedule milestone extraction.
 *
 * Built for large, multi-building MS Project / P6 exports (e.g. Zenith on 25th:
 * 96 pages, 1,800+ rows, 5 buildings, the full sequence repeated per building
 * with the final Turnover/TCO ~130k chars deep).
 *
 * Three improvements over the old inline parser:
 *  1. ROW-STRUCTURED text, group PDF text items by Y position so each schedule
 *     row ("108 Meps trades 10 days Tue 1/12/27 ...") is one clean line, instead
 *     of a run-on blob. Far more reliable for both the AI and the fallback.
 *  2. WHOLE document, read all pages and send the full row text (Haiku's 200k
 *     context easily fits ~160k chars), so project-level start/end aren't cut off.
 *  3. DETERMINISTIC FALLBACK, if the AI returns nothing, a keyword+date scanner
 *     still pulls the core milestones, so a recognizable schedule never yields [].
 */
import { getAnthropicKey } from './anthropicKey.js';
import { buildUntrustedPrompt, warnOnInjection } from './agent/untrusted.js';
import { modelParams, answerBudget, warnIfTruncated } from './aiModels.js';
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
 *   M/D/YY, MS Project / Excel exports
 *   DD-Mon-YY, Primavera P6, which is what most large GCs actually send
 *                 ("07-Oct-24 A", "26-Aug-27*", the A and asterisk are P6's
 *                 actual/constraint markers, not part of the date)
 *
 * Only the slash form was matched until 2026-08-19, so on a P6 schedule this
 * pass found its keyword rows, found no date on them, and returned zero
 * milestones. It is meant to be the floor that survives an AI timeout, on the
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
//
// Mike, 2026-08-19: "yes do it 1 per bldg. that is a big deal. do final
// inspection or tco per bldg too."
//
// Light fixtures, final inspection and TCO are per-BUILDING facts, not
// per-project ones. On Marmalade the buildings turn over roughly six months
// apart, so a single "light fixtures: 2026-02-26" line answers the question for
// Bldg A and quietly gives the wrong answer for B, C and D, and the fixture
// install date is the date material has to be on site, so being wrong about it
// by six months is the difference between a delivery that lands and one that
// misses. Site lighting stays single because a site is a site.
//
// PER_BUILDING is the list of families that may repeat. The `-\d+` is OPTIONAL
// on purpose:
//   • a single-building schedule can honestly return a bare "tco", and
//   • every schedule parsed before today stored bare "light-fixtures" / "tco",
//     which must keep loading rather than vanishing from the card.
const PER_BUILDING  = ['electrical-rough', 'mep-rough', 'light-fixtures', 'final-inspection', 'tco'];
const SINGLETON_IDS = new Set(['construction-start', 'site-lighting', 'electrical-devicing', 'construction-end']);
const MULTI_RE = new RegExp(`^(${PER_BUILDING.join('|')})(-\\d+)?$`);

// Mike, 2026-08-19: "do it. we need things right always. all [schedules] should
// be read by fable 5."
//
// Both of these exist because of one bug. The old pass sent Haiku the first
// 180,000 characters of the row text. Mike's real Modera Marmalade schedule is
// 309,972 characters, so 42% of it, including every "Set Light Fixtures" row
// for the last building, was never read at all. Fable 5 takes a 1,000,000-token
// input window, which is roughly 3.5 million characters; the reader's own
// 120-page ceiling tops out near 450,000, so at 600,000 the cut can no longer
// bind on any schedule this app is able to read in the first place.
//
// It is deliberately a hard number rather than "no limit": a corrupt PDF that
// somehow yields megabytes of junk should cost one truncated call, not a
// runaway bill.
//
// The model itself now comes from src/lib/aiModels.js under the job name
// 'schedule.construction', so there is one place that answers "what reads a
// schedule" rather than a name typed here.
// Reading the whole 84-page Marmalade schedule takes Fable ~28s. The old 22s
// ceiling was sized for Haiku on a third of the text and would now kill every
// large read on the way to the answer. The routes that call this set
// maxDuration well above it, so the ceiling is a backstop, not the binding
// constraint, but it still exists so a hung call cannot hold a Lambda open.
const AI_TIMEOUT_MS      = 90000;
const MAX_SCHEDULE_CHARS = 600000;

const PROMPT_HEAD = `You are reading a construction schedule (Primavera P6, MS Project, Excel, or similar Gantt export). It may be a MULTI-BUILDING / multi-phase schedule where the same sequence repeats per building or tower.

Extract milestone dates and return ONLY a valid JSON array, no markdown, no explanation.
Return format: [{"id":"milestone-id","label":"Milestone Label","date":"YYYY-MM-DD"}, ...]

Milestone types:

• "construction-start": the EARLIEST project start: NTP, Notice to Proceed, Mobilization, project start, first day of construction. ONE entry, the earliest date. "A" (Actual) dates count.

• "electrical-rough-1","electrical-rough-2",...: Electrical rough-in / overhead electrical / in-wall electrical, per building or floor. Use the EARLIEST start for each. Sort ascending, number sequentially, label with the building/floor (e.g. "Electrical Rough-In: Bldg A"). Exclude switchgear, panelboard, fire alarm, underground/conduit, transformers.

• "mep-rough-1","mep-rough-2",...: MEP rough-in. In this schedule MEP rough is often named "Meps trades", "Meps Trades First floor", "Meps trades second/third floor". Treat all of those as MEP rough-in. One entry per building/floor grouping, earliest start, numbered ascending, labelled with the building/floor.

• "light-fixtures-1","light-fixtures-2",...: rows where interior light fixtures are actually INSTALLED: "Set Light Fixtures", "Install Light Fixtures", "Finish Electrical (Light Fixtures)", "Lighting Install". ONE ENTRY PER BUILDING (or per tower/phase), using the EARLIEST true install for that building. This is the date material must be on site there. Number ascending by date and label with the building (e.g. "Light Fixtures: Bldg B"). Exclude submittal, procurement, delivery, rough-in and site/exterior lighting.

• "site-lighting": the EARLIEST row where site/exterior/parking-lot lighting or bollards are actually SET or TERMINATED ("Install Site Lighting", "Set Site Light Poles", "Term Out Site Lighting"). Exclude the trenching that precedes it: "Excavate for Site Lighting", ductbank, conduit, bases and pours are NOT this milestone. ONE entry: the site is shared by all buildings.

• "electrical-devicing": electrical devicing / electrical trim / device trim-out. Exclude door trim, MEP trim, plumbing trim and fire-protection trim. ONE entry, earliest.

• "final-inspection-1","final-inspection-2",...: the AHJ / city FINAL inspection: "Final Inspection", "Final Electrical Inspection", "Final Building Inspection", "Final Life Safety Inspection". ONE ENTRY PER BUILDING, using that building's final-inspection finish. Number ascending by date and label with the building. Exclude rough / in-wall / above-ceiling inspections, and exclude the contractor's own punch walk. Omit entirely if the schedule has no final-inspection rows.

• "tco-1","tco-2",...: Temporary Certificate of Occupancy ("TCO release", "Temp C/O"). ONE ENTRY PER BUILDING, using that building's TCO finish. Number ascending by date and label with the building (e.g. "TCO: Bldg C").

• "construction-end": project completion: "Turnover Keys", "Owners Walk", Final Completion, Substantial Completion, owner move-in, closeout. For a multi-building schedule use the LATEST finish across ALL buildings. ONE entry.

Rules:
- Only milestones explicitly in the schedule, never invent dates.
- The numbered families (electrical-rough, mep-rough, light-fixtures, final-inspection, tco) are ONE ENTRY PER BUILDING. If the schedule covers a single building, still return a single numbered entry ("tco-1"). Never merge two buildings into one entry, and never split one building into two.
- Use the SAME building names across families, exactly as the schedule writes them, so "Light Fixtures: Bldg B" and "TCO: Bldg B" line up.
- Dates are usually "Day M/D/YY"; the FIRST date in a row is its start, the second is its finish. Use the start for start-type milestones and the finish for completion-type (tco, construction-end).
- Return [] only if there are truly no recognizable milestones.
`;

export async function aiExtractMilestones(text, anthropic, ctx = {}) {
  if (!text) return [];

  // The rows are the GC's schedule export. They used to be concatenated onto the
  // end of PROMPT_HEAD under a "Schedule rows:" label, one string, two authors.
  // See src/lib/agent/untrusted.js. 180k chars is a lot of stranger-written text
  // to hand a model, which is exactly why it needs the fence rather than despite it.
  const sealed = buildUntrustedPrompt({
    instructions: PROMPT_HEAD,
    documents:    [{ text, descriptor: 'construction schedule', maxChars: MAX_SCHEDULE_CHARS }],
  });
  warnOnInjection('schedule.construction.parse', ctx.projectId, sealed);

  const msg = await anthropic.messages.create({
    ...modelParams('schedule.construction'),
    max_tokens: answerBudget('schedule.construction', 4000),
    system:   sealed.system,
    messages: [{ role: 'user', content: sealed.content }],
  });
  warnIfTruncated(msg, 'schedule.construction');
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
  // Deliberately still requires the word "rough", matching bare "Electrical"
  // would sweep up "Trench For Electrical" and "Submittals - Electrical Gear",
  // which are not rough-ins.
  mep:   [/meps?\s+trades/i, /\bMEP\b[\s-]*rough/i, /rough[\s-]*in\s+meps?\b/i, /mechanical rough/i, /overhead mechanical/i],
  elec:  [/electrical rough/i, /rough[\s-]*in\s+electrical/i, /overhead electrical/i],
  tco:   [/\bTCO\b/i, /temp(?:orary)? c\.?o\.?/i, /temporary certificate of occupanc/i],
  end:   [/turnover keys/i, /owners?\s+walk/i, /final completion/i, /substantial completion/i, /owner move/i],
  // Added 2026-08-19 alongside the per-building work. Without these two, a
  // schedule whose AI read times out comes back with rough-ins and nothing else
  // no fixture date at all, which is the one date this company plans around.
  fixtures:  [/\b(set|install|hang)\b[^\n]{0,24}\blight(?:ing)?\s+fixtures?/i, /\blight(?:ing)?\s+fixtures?\b[^\n]{0,12}\binstall/i, /finish electrical[^\n]{0,30}light/i, /\blighting\s+install\b/i],
  finalInsp: [/\bfinal\b[\s-]*(?:electrical\s+|building\s+|life\s+safety\s+|mep\s+|elec\s+)?inspect/i, /\binspection\s*[-–]\s*final\b/i],
};
// For these two the exclusions carry more weight than the matches. A schedule
// names light fixtures a dozen times before one is ever hung, submittal,
// procurement, delivery, and "Set Site Light Poles" is site lighting, a
// different milestone with a different date.
const FIXTURE_EXCLUDE    = /submittal|procure|purchase|deliver|\border\b|release|rough|\bsite\b|exterior|parking|\bpole|bollard|landscape/i;
// "Rough Inspection" and "Pre-Final Inspection" are not the AHJ final.
const INSPECTION_EXCLUDE = /rough|in-?wall|above[\s-]?ceiling|pre-?final|punch/i;
const matches = (row, res) => res.some(re => re.test(row));

export function keywordExtractMilestones(text) {
  if (!text) return [];
  const rows = text.split('\n');
  const startDs = [], mepDs = [], elecDs = [], fixDs = [], inspDs = [], tcoDs = [], endDs = [];
  for (const row of rows) {
    const ds = datesInRow(row);
    if (!ds.length) continue;
    if (matches(row, KW.start)) startDs.push(ds[0]);
    if (matches(row, KW.mep))   mepDs.push(ds[0]);
    if (matches(row, KW.elec))  elecDs.push(ds[0]);
    if (matches(row, KW.fixtures)  && !FIXTURE_EXCLUDE.test(row))    fixDs.push(ds[0]);
    if (matches(row, KW.finalInsp) && !INSPECTION_EXCLUDE.test(row)) inspDs.push(ds[ds.length - 1]); // finish
    if (matches(row, KW.tco))   tcoDs.push(ds[ds.length - 1]); // finish
    if (matches(row, KW.end))   endDs.push(ds[ds.length - 1]); // finish
  }
  const start = startDs.length ? startDs.sort()[0] : null;
  // Everything downstream must fall on/after construction start, drops
  // design/submittal-phase "MEP"/"electrical" references (e.g. 2025 utility
  // design rows).
  const floor = start || '2020-01-01';
  const afterStart = ds => [...new Set(ds.filter(d => d >= floor))].sort();

  const out = [];
  if (start) out.push({ id: 'construction-start', label: 'Construction Start', date: start });

  // One numbered entry per distinct date. This pass cannot read a building name
  // off a row, it only knows "this happened five times on five dates", so it
  // numbers what it finds and the AI's labelled version replaces the whole
  // family whenever the AI ran at all (see mergeMilestones).
  const perBuilding = (ds, id, label) => afterStart(ds).slice(0, 15)
    .forEach((d, i) => out.push({ id: `${id}-${i + 1}`, label: `${label} ${i + 1}`, date: d }));

  perBuilding(elecDs, 'electrical-rough',  'Electrical Rough-In');
  perBuilding(mepDs,  'mep-rough',         'MEP Rough-In');
  perBuilding(fixDs,  'light-fixtures',    'Light Fixtures');
  perBuilding(inspDs, 'final-inspection',  'Final Inspection');
  perBuilding(tcoDs,  'tco',               'TCO');

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
export async function extractScheduleMilestones(buffer, anthropic, { aiTimeoutMs = AI_TIMEOUT_MS, ...ctx } = {}) {
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
export async function extractScheduleMilestonesFromText(text, anthropic, { aiTimeoutMs = AI_TIMEOUT_MS, ...ctx } = {}) {
  if (!text || text.trim().length < 50) {
    return { text: null, milestones: [], source: 'none', diag: { fromStoredText: true, textLen: text?.length ?? 0 } };
  }
  return milestonesFromText(text, anthropic, { aiTimeoutMs, ...ctx }, { fromStoredText: true, textLen: text.length });
}

async function milestonesFromText(text, anthropic, { aiTimeoutMs = AI_TIMEOUT_MS, ...ctx } = {}, diag = {}) {
  // The whole point of the 2026-08-19 fix was that this used to be silently true
  // on real schedules. If it is ever true again we want to see it in the record.
  diag.truncated = text.length > MAX_SCHEDULE_CHARS;
  if (diag.truncated) console.warn(`[extractScheduleMilestones] text ${text.length} chars exceeds ${MAX_SCHEDULE_CHARS}, tail not read`);

  const keyword = keywordExtractMilestones(text);

  let ai = [];
  try { ai = await withTimeout(aiExtractMilestones(text, anthropic, ctx), aiTimeoutMs, 'AI extraction'); }
  catch (e) { console.error('[extractScheduleMilestones] AI skipped:', e?.message ?? e); diag.aiError = e?.message ?? String(e); }

  const milestones = mergeMilestones(ai, keyword);
  const source = ai.length && keyword.length ? (milestones.length > ai.length ? 'ai+keyword' : 'ai')
               : ai.length                   ? 'ai'
               : keyword.length              ? 'keyword'
               : 'none';
  return { text, milestones, source, diag };
}

/**
 * Combine the two passes instead of picking one of them.
 *
 * The old rule was "whichever returned more rows wins". That sounds reasonable
 * and is exactly backwards: the keyword scan pads itself out to 15 electrical
 * plus 15 MEP rough-ins, so on a big schedule it wins on COUNT while being worse
 * on SUBSTANCE. On Mike's Marmalade schedule the keyword scan returned 19 rows
 * and the AI returned 16, so the AI lost, and with it went the light-fixture
 * and site-lighting dates, which are the two a lighting company actually plans
 * around. Worse, the AI's count varies run to run, so the same file could land
 * on the good answer or the bad one depending on the day.
 *
 * Now: the AI is authoritative for anything it recognised, and the keyword scan
 * only fills in what the AI did not return. Nothing is ever thrown away, and the
 * result no longer depends on which list happened to be longer.
 *
 * The per-building families (rough-ins, light fixtures, final inspection, TCO)
 * are merged by FAMILY, not by individual id. The AI numbers them per building
 * ("light-fixtures-1..4" = Bldgs A, D, labelled with the building name); the
 * keyword scan numbers them by whatever order dates appeared, with no idea which
 * building is which. Filling gaps id-by-id would interleave two incompatible
 * numbering schemes and invent buildings that do not exist, so if the AI
 * produced any member of a family, that family is the AI's entirely.
 */
export function mergeMilestones(ai = [], keyword = []) {
  const familyOf = (id) => {
    const m = MULTI_RE.exec(id);
    return m ? m[1] : null;
  };

  const out          = [...ai];
  const takenIds     = new Set(ai.map(m => m.id));
  const takenFamilies = new Set(ai.map(m => familyOf(m.id)).filter(Boolean));

  for (const m of keyword) {
    const family = familyOf(m.id);
    if (family ? takenFamilies.has(family) : takenIds.has(m.id)) continue;
    out.push(m);
  }

  // Stable, human-readable order: the sequence a job actually runs in, with the
  // numbered rough-ins ascending inside their own block.
  const ORDER = ['construction-start', 'mep-rough', 'electrical-rough', 'light-fixtures',
                 'site-lighting', 'electrical-devicing', 'final-inspection', 'tco',
                 'construction-end'];
  const rank = (id) => {
    const i = ORDER.indexOf(familyOf(id) || id);
    return i === -1 ? ORDER.length : i;
  };
  const num = (id) => parseInt(id.split('-').at(-1), 10) || 0;
  return out.sort((a, b) => rank(a.id) - rank(b.id) || num(a.id) - num(b.id) || a.date.localeCompare(b.date));
}
