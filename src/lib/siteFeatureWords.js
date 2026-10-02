/**
 * Site features — the WORDS half: kinds, labels, row keys, list clean-up and
 * plain-English descriptions. No prices live here.
 *
 * Split out of `siteFeatures.js` (which keeps the fixture rules and dollar
 * defaults) so the screens a public visitor's browser loads — the drawing
 * dropzone, the merged-read rollup, the shared budget breakdown — can name a
 * dog park without bundling what we charge for one. Mike 2026-09-15: the
 * pricing model must not ship to a public visitor's browser.
 *
 * PURE. No canvas, no Node, no React.
 */

/** The site-feature kinds the vision read may report, in display order. */
export const SITE_FEATURE_TYPES = ['dogPark', 'courtyard', 'playground', 'tennisCourt', 'pickleballCourt', 'turfPlay'];

/** Display labels for the site-feature kinds, shared by every screen. */
export const SITE_FEATURE_LABELS = {
  dogPark:         'Dog park',
  courtyard:       'Courtyard',
  playground:      'Playground',
  tennisCourt:     'Tennis court',
  pickleballCourt: 'Pickleball court',
  turfPlay:        'Turf play area',
};

/** The linear features — priced per foot of their longest dimension. */
export const LINEAR_SITE_FEATURES = new Set(['courtyard', 'turfPlay']);

/**
 * A courtyard no one measured counts as this many feet each: 2 pedestrian
 * poles at the default 1 pole per 30 ft (Mike 10-1: "2 poles per courtyard
 * until we learn more"). Drawings rarely dimension a courtyard, so a courtyard
 * seen on the landscape sheet with no length, or a count typed by a visitor,
 * becomes count x this many feet. A real measured length always wins.
 */
export const COURTYARD_FT_EACH = 60;

/**
 * Clean one sheet's `siteFeatures` array: known types only, whole counts,
 * non-negative lengths, and one entry per type (two "COURTYARD" entries on a
 * sheet are added together). Anything else is dropped — this shape arrives
 * from a model and, on the public route, is echoed back by a browser.
 */
export function normalizeSiteFeatures(list, page = null) {
  if (!Array.isArray(list)) return [];
  const byType = new Map();
  for (const raw of list) {
    const type = String(raw?.type ?? '');
    if (!SITE_FEATURE_TYPES.includes(type)) continue;
    const count = Math.round(Number(raw?.count));
    if (!Number.isFinite(count) || count <= 0) continue;
    const len = Number(raw?.lengthFt);
    const lengthFt = LINEAR_SITE_FEATURES.has(type) && Number.isFinite(len) && len > 0 ? Math.round(len) : null;
    const assumed = type === 'courtyard' && (lengthFt == null || raw?.lengthAssumed === true);
    const label = String(raw?.label ?? '').trim().slice(0, 80) || null;
    const prev = byType.get(type);
    if (prev) {
      prev.count += count;
      if (lengthFt != null) prev.lengthFt = (prev.lengthFt ?? 0) + lengthFt;
      if (!assumed) prev.lengthAssumed = false;
      if (!prev.label && label) prev.label = label;
    } else {
      byType.set(type, { type, count, lengthFt, label, sheet: raw?.sheet ?? page ?? null, ...(assumed ? { lengthAssumed: true } : {}) });
    }
  }
  // A courtyard seen but not measured is priced at a standard length each.
  for (const f of byType.values()) {
    if (f.type === 'courtyard' && f.lengthFt == null) { f.lengthFt = f.count * COURTYARD_FT_EACH; f.lengthAssumed = true; }
  }
  return SITE_FEATURE_TYPES.filter(t => byType.has(t)).map(t => byType.get(t));
}

/**
 * The takeoff / questionnaire row key for each feature type, and back.
 * Counts for the per-count kinds, feet for the linear ones.
 */
export const SITE_FEATURE_ROW_KEYS = {
  dogPark:         'dogParks',
  courtyard:       'courtyardFt',
  playground:      'playgrounds',
  tennisCourt:     'tennisCourts',
  pickleballCourt: 'pickleballCourts',
  turfPlay:        'turfPlayFt',
};

/** Row key → feature type (the reverse of SITE_FEATURE_ROW_KEYS). */
export const SITE_FEATURE_TYPE_BY_ROW_KEY = Object.fromEntries(
  Object.entries(SITE_FEATURE_ROW_KEYS).map(([type, key]) => [key, type])
);

/** Grid labels for the six flat row keys, in display order. */
export const SITE_FEATURE_ROW_LABELS = {
  dogParks:         '# Dog Parks',
  courtyardFt:      'Courtyard Length (ft)',
  playgrounds:      '# Playgrounds',
  tennisCourts:     '# Tennis Courts',
  pickleballCourts: '# Pickleball Courts',
  turfPlayFt:       'Turf Play Length (ft)',
};

/**
 * Rebuild a `siteFeatures` array from the flat takeoff rows (`q`) the public
 * estimate prices from. A linear kind carries one feature whose length is the
 * row's feet; a count kind carries the row's count. Zero or missing → absent.
 */
export function siteFeaturesFromRows(q) {
  const out = [];
  for (const type of SITE_FEATURE_TYPES) {
    const v = Number(q?.[SITE_FEATURE_ROW_KEYS[type]]);
    if (!Number.isFinite(v) || v <= 0) continue;
    out.push(LINEAR_SITE_FEATURES.has(type)
      ? { type, count: 1, lengthFt: Math.round(v) }
      : { type, count: Math.round(v), lengthFt: null });
  }
  return out;
}

/**
 * The inverse: a `siteFeatures` array → the flat row values the Project Data
 * grids display and save (`dogParks`, `courtyardFt`, …). Every key is present;
 * an absent kind reads 0, which is also what typing 0 means ("none").
 */
export function siteFeaturesToRows(list) {
  const out = {};
  for (const type of SITE_FEATURE_TYPES) out[SITE_FEATURE_ROW_KEYS[type]] = 0;
  for (const f of normalizeSiteFeatures(list)) {
    out[SITE_FEATURE_ROW_KEYS[f.type]] = LINEAR_SITE_FEATURES.has(f.type)
      ? (f.lengthFt || 0)
      : (f.count || 0);
  }
  return out;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One found feature in plain words, the way the Drawings page lists it
 * (Mike 2026-09-16: "If we find 1 dog park it should say that"):
 *
 *   "1 dog park (sheet 4)"
 *   "2 pickleball courts"
 *   "courtyard, 90 ft long (sheet 6)"
 *   "courtyard, length not measured"
 *
 * Null for an unknown kind or an empty count.
 */
export function describeSiteFeatureFinding(f) {
  const type = String(f?.type ?? '');
  if (!SITE_FEATURE_TYPES.includes(type)) return null;
  const count = Math.max(0, Math.round(Number(f?.count) || 0));
  if (!count) return null;
  const name = SITE_FEATURE_LABELS[type].toLowerCase();
  const where = f?.sheet ? ` (sheet ${f.sheet})` : '';
  if (LINEAR_SITE_FEATURES.has(type)) {
    const len = f?.lengthAssumed ? 0 : Math.max(0, Math.round(Number(f?.lengthFt) || 0));
    const head = count > 1 ? plural(count, name) : name;
    return len > 0
      ? `${head}, ${len.toLocaleString('en-US')} ft long${where}`
      : `${head}, length not measured${where}`;
  }
  return `${plural(count, name)}${where}`;
}

/** Every found feature in a list, in display order, as plain words. */
export function siteFeatureFindings(list) {
  return normalizeSiteFeatures(list).map(describeSiteFeatureFinding).filter(Boolean);
}

/** The six kinds named together, for a "none found" sentence. */
export const SITE_FEATURE_KINDS_SENTENCE = 'dog park, courtyard, playground, tennis or pickleball court, or turf play area';

/**
 * The label a budget breakdown line gets for one priced feature — the kind,
 * how many (or how long), and the fixtures it earned. Takes an item from
 * `priceSiteFeatures()`; needs no prices, so the public review page may use it.
 *
 *   "Dog park × 1 — 1 area light"
 *   "Courtyard, 90 ft — 3 pedestrian poles"
 *   "Pickleball courts × 2 — 8 area lights"
 */
export function siteFeatureLineLabel(item) {
  const type = String(item?.type ?? '');
  const base = SITE_FEATURE_LABELS[type] || item?.label || 'Site feature';
  const count = Math.max(0, Math.round(Number(item?.count) || 0));
  const fixtures = Math.max(0, Math.round(Number(item?.fixtures) || 0));
  const kind = item?.fixtureKind === 'areaLight' ? 'area light' : 'pedestrian pole';
  let head;
  if (LINEAR_SITE_FEATURES.has(type)) {
    const len = Math.max(0, Math.round(Number(item?.lengthFt) || 0));
    head = len > 0 ? `${base}, ${len.toLocaleString('en-US')} ft` : `${base}, no length yet`;
  } else {
    head = `${count === 1 ? base : base + 's'} × ${count}`;
  }
  return fixtures > 0 ? `${head} — ${plural(fixtures, kind)}` : head;
}
