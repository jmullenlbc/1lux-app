/**
 * Catalog family rules for the "we suggest" step (Mike 10-18). Pure.
 *
 * A catalog number is a family plus option codes:
 *   DL-7-3000          family DL-7, CCT 3000
 *   STR-48-40L-3500-BB family STR-48-40L, CCT 3500, battery
 *   CYWS-30-B          family CYWS-30, finish B
 *   FMML 13 840 WH     family FMML-13, CCT 840, finish WH
 * Swaps are learned and matched on brand + family; options carry over from
 * the original spec to our suggestion.
 */

const BRANDS = [
  ['ELUMA', 'ELUMA'], ['LITHONIA', 'LITHONIA'], ['ACUITY', 'ACUITY'], ['PLACEHOLDER', 'PLACEHOLDER'],
  ['KUZCO', 'KUZCO'], ['MAXIM', 'MAXIM'], ['AFX', 'AFX'], ['WAC', 'WAC'], ['TECH LIGHTING', 'TECH LIGHTING'],
  ['VISUAL COMFORT', 'VISUAL COMFORT'], ['JUNO', 'JUNO'], ['HALO', 'HALO'], ['DIODE', 'DIODE LED'],
  ['PURE LIGHTING', 'PURE LIGHTING'], ['CSL', 'CSL'], ['LUMINII', 'LUMINII'], ['BEGA', 'BEGA'],
  ['HINKLEY', 'HINKLEY'], ['KICHLER', 'KICHLER'], ['SPJ', 'SPJ'], ['LUMENPULSE', 'LUMENPULSE'],
  ['PROGRESS', 'PROGRESS'], ['HUBBELL', 'HUBBELL'], ['COOPER', 'COOPER'], ['GENLYTE', 'GENLYTE'],
  ['MINKA', 'MINKA AIRE'], ['NORA', 'NORA LIGHTING'], ['BARRON', 'BARRON'], ['GLOBALUX', 'GLOBALUX'],
  ['LIGHTS DIRECT', 'LIGHTS DIRECT'], ['METALUX', 'METALUX'], ['MCGRAW', 'MCGRAW-EDISON'],
  ['EUROFASE', 'EUROFASE'], ['LIGHTOLIER', 'LIGHTOLIER'], ['GOTHAM', 'GOTHAM'], ['AMERLUX', 'AMERLUX'],
  ['LUMENWERX', 'LUMENWERX'], ['DMF', 'DMF'], ['GM LIGHTING', 'GM LIGHTING'], ['CORE LIGHTING', 'CORE LIGHTING'],
  ['HAPCO', 'HAPCO'], ['SAGE', 'SAGE'], ['BDL', 'BDL'], ['HYBRILUX', 'HYBRILUX'], ['ELITE', 'ELITE'],
  ['BY OTHERS', 'BY OTHERS'], ['NOT USED', 'NOT USED'],
];

/** One spelling per brand ("Lithonia Lighting", "LITHONIA" both read LITHONIA). */
export function normMfr(raw) {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9&/ -]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  for (const [needle, name] of BRANDS) if (s.includes(needle)) return name;
  return s.slice(0, 40);
}

const OPTION_RULES = [
  ['cct', /^(\d?CCT|[2-6]\d{3}K?|[2-6][057]K|[89][0-9]{2}|SWW?\d?|TUNABLE)$/],
  ['finish', /^(B|BK|BL|BLK|BN|BZ|DBZ|W|WH|WHT|C|CH|SN|NI|MB|BRZ|AB|ORB|GRY|SLV)$/],
  ['sensor', /^(MS|PIR|OCC|SENSOR|DS|PCU?|PE\d?)$/],
  ['battery', /^(BB|EM|EMG|EL\d+|EMBB|E10WCP|BATT)$/],
  ['voltage', /^(MVOLT|UNV|120|277|347|480|120-277|HVOLT)$/],
  ['dimming', /^(ZT|DIM|0-10V|010V|TRIAC|ELV|D10|DALI)$/],
];

const STOP_WORDS = /^(WITH|PLUS|AND|OR|FINN?ISH|FILM|LAMP|E26|TBD|PER|SEE)$/;

function optionKind(tok) {
  for (const [kind, re] of OPTION_RULES) if (re.test(tok)) return kind;
  return null;
}

/**
 * Split a catalog number into its family and option codes. Only the first
 * line counts (later lines are notes). The family is the leading tokens up to
 * the first option code, at most four tokens.
 */
export function splitCatalog(raw) {
  const first = String(raw ?? '').split(/\r?\n/)[0].toUpperCase().replace(/[()#"*+]/g, ' ').trim();
  const toks = first.split(/[\s\-/,]+/).filter(Boolean);
  // Words that start a note, not a part number (EX-LSB-PS WITH LAMP, CYWS-30 FINISH TBD).
  const stop = toks.findIndex((t, idx) => idx > 0 && STOP_WORDS.test(t));
  if (stop > 0) toks.length = stop;
  const fam = [];
  const options = {};
  let i = 0;
  for (; i < toks.length && fam.length < 4; i++) {
    // A colour temperature ends the family after one token (DL-7-3000 needs two,
    // but FMML 840 needs one); any other option code only after two (PS-UNV-96-24).
    const kind = optionKind(toks[i]);
    if (kind && (fam.length >= 2 || (kind === 'cct' && fam.length >= 1))) break;
    fam.push(toks[i]);
  }
  for (; i < toks.length; i++) {
    const kind = optionKind(toks[i]);
    if (kind && !options[kind]) options[kind] = toks[i];
  }
  return { family: fam.join('-'), options };
}

/** BRAND|FAMILY, or null when either part is missing. */
// Words people type where a brand or catalog should be. Nothing to learn from.
const NOT_A_PRODUCT = /^(TBD|TBC|N\/?A|NONE|\?+|-+|BY OTHERS|NOT USED|NIC|EXISTING\b.*|ORIGINAL SPEC.*|AS SPEC.*|SAME\b.*|SEE\b.*|PER\b.*|.*\bOR EQUAL)$/;

/** True when the text says "same as the original spec" instead of naming a product. */
export function saysAsSpecified(text) {
  return /ORIGINAL SPEC|AS SPEC|SAME AS|PER SPEC|SPEC(IFIED)? PRODUCT/i.test(String(text || ''));
}

/**
 * BRAND|FAMILY with separators dropped (LD-L2-6-15 and LDL2-6-15 match), or
 * null when either part is missing or is a placeholder word (TBD, N/A).
 */
export function familyKey(mfr, catalog) {
  const brand = normMfr(mfr);
  const { family } = splitCatalog(catalog);
  if (!brand || !family) return null;
  const rawFirst = String(catalog ?? '').split(/\r?\n/)[0].toUpperCase().trim();
  if (NOT_A_PRODUCT.test(brand) || NOT_A_PRODUCT.test(rawFirst) || NOT_A_PRODUCT.test(family.replace(/-/g, ' '))) return null;
  return `${brand}|${family.replace(/-/g, '')}`;
}

const CATEGORIES = [
  ['fan', /\bFAN\b/], ['exit/emergency', /EXIT|EMERG|FROG|BUG ?EYE/], ['pole/area', /POLE|AREA LIGHT|PARKING LOT|SHOEBOX/],
  ['bollard', /BOLLARD/], ['step/stair', /\bSTEP|STAIR/], ['tape/strip', /TAPE|COVE|UNDER ?CAB|UNDERCAB|\bUC\b/],
  ['linear', /LINEAR|SLOT|WRAP|STRIP/], ['vanity', /VANITY|BATH BAR|MIRROR/], ['pendant', /PENDANT|CHANDELIER/],
  ['sconce', /SCONCE|WALL ?PACK|WALL MOUNT|WALL LIGHT/], ['surface disk', /DISK|DISC|PUCK|SURFACE MOUNT|FLUSH|EDGE.LIT/],
  ['downlight', /DOWN ?LIGHT|RECESS|\bCAN\b|WAFER|CYLINDER/], ['garage', /GARAGE|VAPOR|CANOPY|PARKING/],
  ['landscape', /LANDSCAPE|UPLIGHT|ACCENT|FLOOD|TREE|IN.?GRADE|PATH/], ['track', /TRACK/],
];

export function categoryOf(...texts) {
  const t = texts.join(' ').toUpperCase();
  for (const [k, re] of CATEGORIES) if (re.test(t)) return k;
  return 'other';
}

/** SWAPPED, KEPT, PLACEHOLDER, ADDED (we proposed with no original) or null (nothing to learn). */
export function swapOutcome(line) {
  const om = normMfr(line.origMfr);
  const pm = normMfr(line.propMfr);
  const proposed = pm || String(line.propCatalog || '').trim();
  if (!proposed) return null;
  if (pm === 'PLACEHOLDER' || /PLACEHOLDER/i.test(line.propCatalog || '')) return 'PLACEHOLDER';
  if (!om && !String(line.origCatalog || '').trim()) return 'ADDED';
  // "Acuity, original spec" in either column counts as kept (Mike 10-19).
  if ((pm && pm === om) || saysAsSpecified(line.propCatalog) || saysAsSpecified(line.propMfr)) return 'KEPT';
  return 'SWAPPED';
}
