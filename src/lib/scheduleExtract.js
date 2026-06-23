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
import { getAnthropicKey } from '@/lib/anthropicKey';

// ── Row-structured PDF text ───────────────────────────────────────────────────
export async function extractScheduleText(buffer, maxPages = 200) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    let text = '';
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
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
    }
    const t = text.trim();
    return t.length > 50 ? t : null;
  } catch (e) {
    console.error('[extractScheduleText] failed:', e?.message ?? e);
    return null;
  }
}

// ── Dates ─────────────────────────────────────────────────────────────────────
function toIso(m, d, y) {
  let yr = parseInt(y); if (yr < 100) yr += 2000;
  const mo = parseInt(m), dy = parseInt(d);
  if (yr < 2020 || yr > 2040 || mo < 1 || mo > 12 || dy < 1 || dy > 31) return null;
  return `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
}
function datesInRow(row) {
  const out = [];
  const re = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
  let m; while ((m = re.exec(row))) { const iso = toIso(m[1], m[2], m[3]); if (iso) out.push(iso); }
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

Schedule rows:
`;

export async function aiExtractMilestones(text, anthropic) {
  if (!text) return [];
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: PROMPT_HEAD + text.slice(0, 180000) }],
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
  mep:   [/meps?\s+trades/i, /\bMEP\b\s+rough/i, /mechanical rough/i, /overhead mechanical/i],
  elec:  [/electrical rough/i, /overhead electrical/i],
  tco:   [/\bTCO\b/i, /temp(?:orary)? c\.?o\.?/i, /temporary certificate of occupanc/i],
  end:   [/turnover keys/i, /owners?\s+walk/i, /final completion/i, /substantial completion/i, /owner move/i],
};
const matches = (row, res) => res.some(re => re.test(row));

export function keywordExtractMilestones(text) {
  if (!text) return [];
  const rows = text.split('\n');
  const startDs = [], mepRows = [], elecRows = [], tcoDs = [], endDs = [];
  for (const row of rows) {
    const ds = datesInRow(row);
    if (!ds.length) continue;
    if (matches(row, KW.start)) startDs.push(ds[0]);
    if (matches(row, KW.mep))   mepRows.push(ds[0]);
    if (matches(row, KW.elec))  elecRows.push(ds[0]);
    if (matches(row, KW.tco))   tcoDs.push(ds[ds.length - 1]); // finish
    if (matches(row, KW.end))   endDs.push(ds[ds.length - 1]); // finish
  }
  const out = [];
  if (startDs.length) out.push({ id: 'construction-start', label: 'Construction Start', date: startDs.sort()[0] });
  elecRows.sort().slice(0, 12).forEach((d, i) => out.push({ id: `electrical-rough-${i + 1}`, label: `Electrical Rough-In ${i + 1}`, date: d }));
  mepRows.sort().slice(0, 12).forEach((d, i) => out.push({ id: `mep-rough-${i + 1}`, label: `MEP Rough-In ${i + 1}`, date: d }));
  if (tcoDs.length) out.push({ id: 'tco', label: 'TCO', date: tcoDs.sort().at(-1) });
  if (endDs.length) out.push({ id: 'construction-end', label: 'Final Completion', date: endDs.sort().at(-1) });
  return out;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
export async function extractScheduleMilestones(buffer, anthropic) {
  const text = await extractScheduleText(buffer);
  if (!text) return { text: null, milestones: [], source: 'none' };
  let milestones = [];
  try { milestones = await aiExtractMilestones(text, anthropic); }
  catch (e) { console.error('[extractScheduleMilestones] AI failed:', e?.message ?? e); }
  if (milestones.length >= 2) return { text, milestones, source: 'ai' };
  const fallback = keywordExtractMilestones(text);
  return { text, milestones: fallback.length ? fallback : milestones, source: fallback.length ? 'keyword' : 'ai' };
}
