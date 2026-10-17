/**
 * Area-sheet finding and net-vs-gross classification.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Architects publish THREE different square-foot totals for the same building,
 * and they disagree with each other in a completely predictable way. Measured
 * on BECK's Virgin Hotel Fox Park set (2026-08-18), same building, same month:
 *
 *   Guestroom matrix  G0.06/G0.07  105,903 SF   NET, room polygons, inside face
 *   Code summary      LS0.01       221,022 SF   CODE, inside perimeter of ext. walls
 *   Program breakdown A-811/A-812  233,050 SF   GROSS, outside face, wall-to-wall
 *
 * All three are correct. They answer different questions. Feeding the wrong one
 * into a $/SF rate is a silent 5 to 8% error in the budget with nothing visibly
 * broken, which is the most expensive kind of mistake this app can make.
 *
 * The ratios, both derived independently on that set:
 *   gross ÷ sum-of-interior-program-blocks = 233,050 ÷ 214,347 = 1.087
 *   guestroom block ÷ net room schedule    = 115,099 ÷ 106,718 = 1.079
 * Two different routes to the same ~8%. That is where GROSS_FROM_NET comes from.
 * The 5% garden-walk-up figure is Mike's rule, validated on Trailhead at 0.8%.
 *
 * ── Why the classifier is deterministic, not a model call ──────────────────
 * The tell is a fixed printed label, not a judgement: "BUILDING GROSS SF" vs
 * "AVG AREA" vs "ACTUAL AREA". Regex reads those exactly, for free, the same way
 * every time, and can show its work. A model asked "is this net or gross?" gives
 * a confident answer either way and we would have no idea why. The model is
 * still used for what it is good at, pulling numbers out of a table, and this
 * module decides what those numbers MEAN.
 *
 * Pure: no IO, no model, no DB. Safe to import from a client component.
 */

// ── 1. Finding the sheet ────────────────────────────────────────────────────

/**
 * Page-level scoring for "does this sheet carry a building area table".
 *
 * Validated 2026-08-18 against the full 442-page Fox Park 100% DD set: the
 * top-ranked page out of 442 was page 3, sheet G0.02 "BUILDING STATISTICS"
 * the correct answer. Scan cost was 105 seconds for the whole set.
 *
 * Weights are ordered by how decisive the phrase is, not how common. A literal
 * "PROGRAM BREAKDOWN" heading appears on exactly the sheet we want and almost
 * nowhere else; "GROSS SF" appears on plenty of sheets in passing.
 */
export const AREA_MARKERS = [
  ['PROGRAM_BREAKDOWN', /PROGRAM BREAKDOWN|LIGHTING PROGRAM|AREA BREAKDOWN/i,                    40],
  ['BUILDING_GROSS',    /BUILDING GROSS|TOTAL GROSS|GROSS BUILDING|BUILDING STATISTICS/i,        30],
  ['AREA_TABLE',        /AREA SCHEDULE|AREA SUMMARY|AREA TABULATION|AREA PLAN|AREA CALCULATION/i,25],
  ['UNIT_MATRIX',       /GUESTROOM (MIX|MATRIX|SCHEDULE)|UNIT (MIX|MATRIX|SCHEDULE)/i,           20],
  ['CODE_AREA',         /ACTUAL AREA|ALLOWABLE AREA/i,                                           10],
];

/**
 * The program categories our questionnaire asks for. A page mentioning several
 * of them is describing the building's makeup rather than one room, the single
 * best signal that we are looking at a whole-building table.
 */
const PROGRAM_CATEGORIES =
  /GUESTROOMS?|\bBOH\b|BACK[- ]OF[- ]HOUSE|CORRIDOR|STAIRWELL|AMENITY|\bFOH\b|RESTROOM|CLUBHOUSE|LEASING/gi;

/** Sheet-number shapes: G0.02, A-811, LS0.01, E1.1, ID2.04. */
const SHEET_NO = /\b([A-Z]{1,3}-?\d{1,3}(?:\.\d{1,2})?)\b/g;

/**
 * Words that turn a sheet-number-shaped token into something else entirely.
 *
 * Real failure, Fox Park DD page 4: we reported "sheet PL100". There is no sheet
 * PL100 in that set. It came out of the architect's address block, "1001 17TH
 * STREET SUITE PL100 DENVER, CO". A reviewer sent to a sheet that does not exist
 * loses more time than one given no sheet number at all.
 */
const ADDRESS_CONTEXT = /\b(SUITE|STE|UNIT|FLOOR|FL|RM|ROOM|BLDG|BUILDING|APT|BOX)\b\.?\s*$/i;

/**
 * Pages that name every sheet in the set, the drawing index.
 *
 * Real failure, Fox Park DD page 2: sheet G0.01 SHEET INDEX scored 70 and was
 * classified as a code area at 0.75 confidence, which is above the review
 * threshold, so a 5.4% uplift would have been applied silently. An index matches
 * every marker we look for because it prints the TITLE of every sheet in the set
 * "LIFE SAFETY PLAN", "AREA PLAN", "GUESTROOM MIX", without carrying a single
 * number. It is the one page in a set guaranteed to look like all of them.
 */
const INDEX_HEADING = /\b(SHEET|DRAWING)\s*(INDEX|LIST)\b|\bINDEX OF DRAWINGS\b|\bLIST OF DRAWINGS\b/i;

/**
 * The counts are wide apart on purpose, measured on the Fox Park DD set:
 *   G0.01 SHEET INDEX          345 distinct sheet-number-shaped tokens
 *   every real sheet in the set  ≤ 14
 * And the 14 are not sheet numbers at all, they are IBC occupancy groups
 * (A-1, A-2, S-1, R-1) and detail bubbles, which happen to be the same shape.
 * So a heading plus a modest count is safe, and a huge count needs no heading.
 */
const INDEX_WITH_HEADING = 8;
const INDEX_ON_COUNT_ALONE = 40;

/** True when this page is a drawing list rather than a drawing. */
export function looksLikeSheetIndex(text) {
  if (!text) return false;

  SHEET_NO.lastIndex = 0;
  const all = String(text).match(SHEET_NO) ?? [];
  const distinct = new Set(all.filter(t => /^[A-Z]{1,3}-?\d/.test(t))).size;

  // The heading alone is not enough, a real drawing may say "SEE SHEET INDEX".
  if (INDEX_HEADING.test(text) && distinct >= INDEX_WITH_HEADING) return true;
  return distinct >= INDEX_ON_COUNT_ALONE;
}

/**
 * Whole-building square footages printed on a page.
 *
 * Comma-grouped ("233,919") or plainly labelled ("21784 SF"). The comma rule is
 * what keeps job numbers and phone numbers out: "JOB NO. 176305" is in range for
 * a building but never written with a comma.
 *
 * @returns {Array<{value:number, index:number}>}
 */
const BIG_NUMBER = /\b(\d{1,3}(?:,\d{3})+|\d{4,7})\b/g;
export function findAreaNumbers(text, min = 10000) {
  if (!text) return [];
  const out = [];
  BIG_NUMBER.lastIndex = 0;
  let m;
  while ((m = BIG_NUMBER.exec(text)) !== null) {
    const raw = m[1];
    const value = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value) || value < min || value > 5_000_000) continue;
    const labelled = /^\s*(SF|S\.F\.|SQ)/i.test(text.slice(m.index + raw.length, m.index + raw.length + 12));
    if (!raw.includes(',') && !labelled) continue;   // bare digits need an "SF" beside them
    out.push({ value, index: m.index });
  }
  return out;
}

/**
 * Pull the sheet number out of a page.
 *
 * Preferred: the token right after "SHEET NO." / "SHEET", which is how a title
 * block is laid out. Title blocks sit at the END of the extracted stream far more
 * often than the start, so later anchors are tried first. Address fragments are
 * rejected outright. Returns null rather than guessing when nothing is
 * convincing, a wrong sheet number sends a reviewer to the wrong page.
 */
export function sheetNumberOf(text) {
  if (!text) return null;

  const anchors = [];
  const anchorRe = /\bSHEET\s*(?:NO\.?|NUMBER|#)?/gi;
  let a;
  while ((a = anchorRe.exec(text)) !== null) {
    anchors.push({ index: a.index + a[0].length, explicit: /NO|NUMBER|#/i.test(a[0]) });
  }
  // Explicit "SHEET NO." beats a bare "SHEET"; later beats earlier.
  anchors.sort((x, y) => (y.explicit ? 1 : 0) - (x.explicit ? 1 : 0) || y.index - x.index);

  for (const anchor of anchors.slice(0, 4)) {
    const pick = firstSheetToken(text, anchor.index, anchor.index + 240);
    if (pick) return pick;
  }

  return firstSheetToken(text, 0, text.length, /* last */ true);
}

/** Scan a slice for the first (or last) token that is a sheet number and not an address. */
function firstSheetToken(text, from, to, last = false) {
  const slice = text.slice(from, to);
  SHEET_NO.lastIndex = 0;
  const hits = [];
  let m;
  while ((m = SHEET_NO.exec(slice)) !== null) {
    const tok = m[1];
    if (!/^[A-Z]{1,3}-?\d/.test(tok)) continue;
    if (ADDRESS_CONTEXT.test(slice.slice(Math.max(0, m.index - 20), m.index))) continue;
    hits.push(tok);
  }
  if (!hits.length) return null;
  return last ? hits[hits.length - 1] : hits[0];
}

/**
 * Score one page.
 * @returns {{score:number, tags:string[], categories:number, numbers:number, readable:boolean}}
 */
export function scoreAreaPage(text) {
  const empty = { score: 0, tags: [], categories: 0, numbers: 0, readable: false };
  if (!text || text.length < 40) return empty;
  if (looksLikeSheetIndex(text)) return empty;

  let score = 0;
  const tags = [];
  for (const [tag, re, weight] of AREA_MARKERS) {
    if (re.test(text)) { score += weight; tags.push(tag); }
  }
  if (score === 0) return empty;

  // How many DISTINCT program categories appear. Distinct, not total hits: a
  // floor plan repeats "CORRIDOR" thirty times and is not an area table.
  const seen = new Set();
  let m;
  PROGRAM_CATEGORIES.lastIndex = 0;
  while ((m = PROGRAM_CATEGORIES.exec(text)) !== null) seen.add(m[0].toUpperCase());
  const categories = seen.size;
  score += Math.min(categories, 7) * 5;

  // Does the page actually carry numbers we can read? BECK's A-811 program
  // breakdown scores 90 and contains zero readable figures, the table is vector
  // art, so only the Revit layer names and the title block survive as text. That
  // page must be reported as "found but unreadable", never as an answer.
  const numbers = findAreaNumbers(text).length;

  return { score, tags, categories, numbers, readable: numbers > 0 };
}

/**
 * Rank pages and return the best area-sheet candidates.
 *
 * Pages whose tables are pictures rank below pages we can actually read, even
 * when they score higher on wording. They are still returned, so the reviewer can
 * be told which sheet to open by hand.
 *
 * @param {Array<{page:number, text:string}>} pages
 * @param {number} limit
 * @returns {Array<{page:number, score:number, tags:string[], categories:number,
 *                  numbers:number, readable:boolean, sheetNo:string|null}>}
 */
export function findAreaSheets(pages, limit = 3) {
  const scored = [];
  for (const p of pages ?? []) {
    const s = scoreAreaPage(p.text);
    if (s.score <= 0) continue;
    scored.push({ page: p.page, ...s, sheetNo: sheetNumberOf(p.text) });
  }
  scored.sort((a, b) =>
    (b.readable ? 1 : 0) - (a.readable ? 1 : 0) || b.score - a.score || a.page - b.page);
  return scored.slice(0, limit);
}

// ── 2. Net vs gross ─────────────────────────────────────────────────────────

/**
 * Evidence table. Each entry is [regex, weight, plain-English label].
 *
 * The labels are written for a reviewer to read, not for a developer, they are
 * shown in the UI as the reason for the verdict, so "the sheet says 'AVG AREA',
 * which is a per-room net figure" has to stand on its own.
 */
export const BASIS_EVIDENCE = {
  gross: [
    [/BUILDING GROSS/i,                     40, 'says "Building Gross"'],
    [/TOTAL (BUILDING )?GROSS/i,            40, 'says "Total Gross"'],
    [/GROSS (BUILDING )?(AREA|SF|SQUARE)/i, 35, 'says "Gross Area/SF"'],
    [/\bG\.?B\.?A\.?\b/,                    30, 'uses GBA (gross building area)'],
    [/OUTSIDE FACE|EXTERIOR FACE/i,         25, 'measured to the outside face of walls'],
    [/\bGSF\b/i,                            20, 'uses GSF'],
  ],
  net: [
    [/NET (RENTABLE|LEASABLE|AREA|SF)/i,    35, 'says "Net" area'],
    [/\bN\.?R\.?S\.?F\.?\b|\bNSF\b/,        30, 'uses NRSF/NSF (net rentable)'],
    [/(AVG|AVERAGE)\.?\s*AREA/i,            30, 'lists "Avg Area" per room type, a net room figure'],
    [/RENTABLE|LEASABLE/i,                  20, 'says "rentable/leasable"'],
    [/(ROOM|UNIT|GUESTROOM)\s*(SCHEDULE|MATRIX|MIX)/i, 15, 'is a room/unit schedule (measured inside face)'],
    [/INSIDE FACE|CLEAR AREA/i,             25, 'measured to the inside face of walls'],
  ],
  code: [
    [/ACTUAL AREA/i,                        40, 'says "Actual Area", the code-summary figure'],
    [/ALLOWABLE AREA/i,                     35, 'sits next to "Allowable Area" (a code table)'],
    [/TABLE 506|IBC|\bIFC\b|CHAPTER 5/i,    25, 'cites the building code area tables'],
    [/LIFE SAFETY/i,                        20, 'is a life-safety sheet'],
  ],
};

/** Cap: a 0.99 confidence would be a lie about a regex. */
const MAX_CONFIDENCE = 0.97;

/**
 * How much text around the number counts as "the table it came from".
 * 900 characters is roughly one table on a full-size architectural sheet once
 * pdfjs has flattened it to a single stream.
 */
const FOCUS_RADIUS = 900;

/**
 * A label printed within this many characters BEFORE the number is that
 * number's own label, the cell heading, not page wording. Architects label
 * table cells, so "TOTAL BUILDING GSF   233,919 SF" is as close to a direct
 * statement as a drawing ever gives us, and it has to outweigh a competing
 * phrase further up the sheet. Three-to-one does that without making it
 * impossible for strong contrary evidence to pull the confidence down.
 */
const ADJACENT = 60;
const ADJACENT_WEIGHT = 3;
const ELSEWHERE_WEIGHT = 0.25;

/** Every position on the page where this number is printed. */
function anchorPositions(text, n) {
  const value = Number(n);
  if (!text || !Number.isFinite(value) || value <= 0) return [];
  const out = [];
  for (const form of new Set([String(value), value.toLocaleString('en-US')])) {
    let i = -1;
    while ((i = text.indexOf(form, i + 1)) !== -1) {
      out.push({ start: i, end: i + form.length });
      if (out.length >= 8) break;
    }
  }
  return out;
}

/** Every basis phrase on the page, with where it is. */
function collectEvidence(text) {
  const hits = [];
  if (!text) return hits;
  for (const kind of Object.keys(BASIS_EVIDENCE)) {
    for (const [re, weight, label] of BASIS_EVIDENCE[kind]) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = g.exec(text)) !== null) {
        hits.push({ kind, weight, label, start: m.index, end: m.index + m[0].length });
        if (m[0].length === 0) g.lastIndex++;         // never spin on a zero-width match
      }
    }
  }
  return hits;
}

/**
 * Narrow a page down to the table a specific number sits in.
 *
 * Real failure, Fox Park DD page 3 (G0.02 BUILDING STATISTICS): that ONE page
 * carries two tables with two different bases, a guestroom mix listing "AVG
 * AREA" per room type (net) and, below it, "GROSS BUILDING AREA … TOTAL BUILDING
 * GSF 233,919 SF" (gross). Judging the whole page gives a 50/50 blend and a
 * meaningless verdict. Judging the text around the number we actually took gives
 * the right answer, because architects label tables, not pages.
 *
 * When the number appears more than once, every window is included. Two windows
 * that disagree drag the confidence down, which is the honest outcome.
 *
 * @returns {string|null} null when the number is not on the page at all
 */
export function focusAroundNumber(text, n, radius = FOCUS_RADIUS) {
  const value = Number(n);
  if (!text || !Number.isFinite(value) || value <= 0) return null;

  const forms = new Set([String(value), value.toLocaleString('en-US')]);
  const windows = [];
  for (const form of forms) {
    let i = -1;
    while ((i = text.indexOf(form, i + 1)) !== -1) {
      windows.push(text.slice(Math.max(0, i - radius), i + form.length + radius));
      if (windows.length >= 4) break;             // a runaway match list helps nobody
    }
  }
  return windows.length ? windows.join('\n') : null;
}

/**
 * Decide whether a page's areas are gross, net, or code area.
 *
 * @param {string} text
 * @param {object} [opts] { near }, a stated square footage. When given, only the
 *   text around that number on the page is judged (see focusAroundNumber). Falls
 *   back to the whole page when the number is not found.
 * @returns {{basis:'gross'|'net'|'code'|'unknown', confidence:number,
 *            evidence:string[], scores:{gross:number,net:number,code:number},
 *            focused:boolean}}
 *
 * Confidence combines two honest things and nothing else:
 *   share, how much of the total evidence points at the winner. A sheet with
 *              both "GROSS SF" and "AVG AREA" on it genuinely IS ambiguous and
 *              should not score high just because one side edged ahead.
 *   strength, how strong the winning evidence is in absolute terms. One weak
 *              hit is not the same as an explicit "BUILDING GROSS SF" heading.
 */
export function classifyAreaBasis(text, opts = {}) {
  const scores = { gross: 0, net: 0, code: 0 };
  const evidence = { gross: [], net: [], code: [] };

  const anchors = opts.near != null ? anchorPositions(text, opts.near) : [];
  const focused = anchors.length > 0;

  const hits = collectEvidence(text);

  // Which phrase is the number's OWN label: the nearest one printed just before
  // it. Nearest, not "any within reach", on a tight sheet two labels can both
  // be close, and only the last one before the number is the cell heading.
  const owning = new Set();
  for (const a of anchors) {
    let nearest = null;
    for (const h of hits) {
      const gap = a.start - h.end;
      if (gap < 0 || gap > ADJACENT) continue;
      if (!nearest || gap < a.start - nearest.end) nearest = h;
    }
    if (nearest) owning.add(nearest);
  }

  // Each distinct phrase counts once, at the best position it was found in.
  // Repeating "AVG AREA" down a column does not make it stronger evidence.
  const best = new Map();
  for (const hit of hits) {
    let weight = hit.weight;
    if (focused) {
      const gap = Math.min(...anchors.map(a =>
        hit.end <= a.start ? a.start - hit.end
        : hit.start >= a.end ? hit.start - a.end
        : 0));
      if (gap > FOCUS_RADIUS) continue;
      weight *= owning.has(hit) ? ADJACENT_WEIGHT : ELSEWHERE_WEIGHT;
    }
    const key = `${hit.kind}|${hit.label}`;
    if (!best.has(key) || best.get(key).weight < weight) best.set(key, { ...hit, weight });
  }

  // Strongest reason first, evidence[0] is what the reviewer is shown.
  for (const hit of [...best.values()].sort((a, b) => b.weight - a.weight)) {
    scores[hit.kind] += hit.weight;
    evidence[hit.kind].push(hit.label);
  }

  const total = scores.gross + scores.net + scores.code;
  if (total === 0) {
    return { basis: 'unknown', confidence: 0, evidence: [], scores, focused };
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [basis, top] = ranked[0];

  const share    = top / total;
  const strength = Math.min(top / 40, 1);
  let confidence = share * (0.55 + 0.45 * strength);

  // Judging a whole sheet is weaker evidence than judging the table the number
  // came from, and the confidence number should say so.
  if (!focused && opts.near != null) confidence *= 0.8;

  return {
    basis,
    confidence: Math.round(Math.min(confidence, MAX_CONFIDENCE) * 100) / 100,
    evidence: evidence[basis],
    scores,
    focused,
  };
}

// ── 3. Converting to the basis our rates expect ─────────────────────────────

/**
 * How much to add to get from a net or code figure to true building gross.
 *
 * gardenWalkUp, Mike's original +5% rule. Validated on Trailhead: the sum of
 *   collected spaces × 1.05 = 139,969 against footprint × 3 = 138,896, a 0.8%
 *   match. Simple rectangles, few shafts, thin structure.
 * midRise, measured at 8.7% twice on Fox Park (see the file header). Elevator
 *   banks, rated stair cores, shafts and thicker structure all live in the gap
 *   between the program blocks and the gross figure.
 * code, 233,050 ÷ 221,022 = 1.054 on Fox Park. The code figure is measured to
 *   the INSIDE perimeter of the exterior walls, so it misses only the exterior
 *   wall thickness, which is why it is a smaller correction than net→gross.
 */
export const GROSS_FROM_NET = { gardenWalkUp: 1.05, midRise: 1.08 };
export const GROSS_FROM_CODE = 1.054;

/** Garden walk-ups and townhomes take the smaller uplift. */
const LOW_RISE = /garden|walk-?up|townho(me|use)|two[- ]story|three[- ]story|3[- ]story|2[- ]story/i;

/**
 * Convert a stated area to true building gross.
 *
 * @param {number|null} sf
 * @param {string} basis  from classifyAreaBasis
 * @param {object} [opts] { buildingType, sourceText }
 * @returns {{value:number|null, factor:number, adjusted:boolean, note:string|null, profile:string|null}}
 *
 * Deliberately returns the ORIGINAL value untouched when the basis is unknown.
 * Applying a correction we cannot justify would turn "we're not sure" into a
 * number that looks measured. Unknown stays unknown and gets flagged instead.
 */
export function toGross(sf, basis, opts = {}) {
  const n = Number(sf);
  if (!Number.isFinite(n) || n <= 0) {
    return { value: null, factor: 1, adjusted: false, note: null, profile: null };
  }

  const hay = `${opts.buildingType ?? ''} ${opts.sourceText ?? ''}`;
  const lowRise = LOW_RISE.test(hay);
  const profile = lowRise ? 'gardenWalkUp' : 'midRise';

  if (basis === 'gross') {
    return { value: n, factor: 1, adjusted: false, profile,
      note: 'The drawing states this as gross building SF, used as-is.' };
  }

  if (basis === 'net') {
    const factor = GROSS_FROM_NET[profile];
    return {
      value: Math.round(n * factor), factor, adjusted: true, profile,
      note: `This is a net (inside-face) area, so ${Math.round((factor - 1) * 100)}% was added for walls and shafts` +
            `${lowRise ? ' (garden walk-up)' : ' (mid/high-rise)'}. Stated: ${n.toLocaleString()} SF.`,
    };
  }

  if (basis === 'code') {
    return {
      value: Math.round(n * GROSS_FROM_CODE), factor: GROSS_FROM_CODE, adjusted: true, profile,
      note: `This came from a code-summary "actual area", which is measured inside the exterior walls. ` +
            `5.4% was added to reach gross. Stated: ${n.toLocaleString()} SF.`,
    };
  }

  return {
    value: n, factor: 1, adjusted: false, profile,
    note: 'We could not tell from the drawing whether this area is gross or net. It was left exactly as stated.',
  };
}

/**
 * One call from raw extraction to a reviewable answer.
 *
 * @param {number|null} statedSf
 * @param {string} sourceText   the text of the sheet the number came from
 * @param {object} [opts]       { buildingType }
 * @returns {{
 *   value:number|null, statedValue:number|null, basis:string, confidence:number,
 *   adjusted:boolean, factor:number, evidence:string[], note:string|null,
 *   needsReview:boolean, focused:boolean, summary:string
 * }}
 *
 * `needsReview` is the flag the UI turns red on. Two ways to earn it: we could
 * not tell what the basis is, or we could but not confidently. Both mean a human
 * should look, which is exactly what the red is for.
 *
 * The classification is anchored to the number wherever possible, see
 * focusAroundNumber. A sheet can carry a net table and a gross table side by
 * side, so "what does this page say" is the wrong question; "what does the table
 * this number came from say" is the right one.
 */
export function resolveGrossSf(statedSf, sourceText, opts = {}) {
  // `Number(null)` is 0 and 0 is finite, so a plain isFinite check would record
  // "the drawing stated 0 SF" for a drawing that stated nothing at all.
  const statedValue = statedSf == null || statedSf === '' || !Number.isFinite(Number(statedSf))
    ? null
    : Number(statedSf);

  const cls = classifyAreaBasis(sourceText, { near: statedValue });
  const conv = toGross(statedSf, cls.basis, { ...opts, sourceText });

  const needsReview = cls.basis === 'unknown' || cls.confidence < CONFIDENT_ENOUGH;

  return {
    value: conv.value,
    statedValue,
    basis: cls.basis,
    confidence: cls.confidence,
    adjusted: conv.adjusted,
    factor: conv.factor,
    evidence: cls.evidence,
    note: conv.note,
    needsReview,
    focused: cls.focused,
    summary: describeBasis(cls.basis, cls.confidence, cls.evidence),
  };
}

/**
 * The threshold for "fill it in quietly" vs "fill it in and turn it red".
 *
 * 0.75 rather than 0.5 on purpose. Getting this wrong is a 5 to 8% budget error
 * that nothing else in the app will catch, so the cost of an unnecessary red
 * flag (someone glances at it) is far below the cost of a missed one.
 */
export const CONFIDENT_ENOUGH = 0.75;

/** Plain-English one-liner for the reviewer. No jargon, no percentages of percentages. */
export function describeBasis(basis, confidence, evidence = []) {
  const pct = Math.round((confidence ?? 0) * 100);
  const why = evidence.length ? `, the sheet ${evidence[0]}` : '';
  if (basis === 'unknown') return 'Could not tell whether this is gross or net. Please check the drawing.';

  // Below the threshold the reader needs to hear the doubt first, not a verdict
  // with a small number after it. "Probably gross, 44% confident" is a different
  // sentence from "reads as gross, 44% confident", and only one of them is true.
  const weak = (confidence ?? 0) < CONFIDENT_ENOUGH;
  const lead = weak ? 'Best guess' : 'Reads as';
  const tail = weak ? ' Please check it against the drawing.' : '';

  if (basis === 'gross') return `${lead} gross (wall-to-wall) building SF, ${pct}% confident${why}.${tail}`;
  if (basis === 'net')   return `${lead} net (inside-face) area, ${pct}% confident${why}. Uplifted to gross.${tail}`;
  if (basis === 'code')  return `${lead} a code-summary area, ${pct}% confident${why}. Uplifted to gross.${tail}`;
  return 'Could not tell whether this is gross or net. Please check the drawing.';
}
