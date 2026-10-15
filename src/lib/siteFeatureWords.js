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
  playground:      'Dog park / playground',
  tennisCourt:     'Tennis / pickleball court',
  pickleballCourt: 'Pickleball court',
  turfPlay:        'Turf play area',
};

/**
 * Kinds that are asked and priced as another kind (Mike 10-14: "We have way
 * too many fields"). A dog park is one "dog park / playground" area priced as
 * the playground package (2 pedestrian poles); a pickleball court is a
 * "tennis / pickleball court" (4 area lights, the same as before). The old
 * kinds stay valid so old SiteFeature rows and drawing reads still load;
 * normalizeSiteFeatures() folds them in.
 */
export const SITE_FEATURE_FOLD = { dogPark: 'playground', pickleballCourt: 'tennisCourt' };

/** The linear features — priced per foot of their longest dimension. */
export const LINEAR_SITE_FEATURES = new Set(['turfPlay']);

/**
 * Courtyards are a COUNT, never a length (Mike 10-14: "Courtyard SF is
 * absurd. We just need # of courtyards"): 2 pedestrian poles each. Before
 * 10-14 a courtyard was priced per foot, 60 ft each when nobody measured it,
 * so old rows and old drafts still carry feet. This constant only turns
 * those feet back into a count.
 */
export const COURTYARD_FT_EACH = 60;

/** Legacy courtyard feet → a courtyard count (60 ft = 1; any length is at least 1). */
export function courtyardsFromFt(ft) {
  const n = Number(ft);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.floor(n / COURTYARD_FT_EACH));
}

/** The pre-10-14 courtyard row key (feet); still accepted on the way in. */
export const LEGACY_COURTYARD_FT_KEY = 'courtyardFt';

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
    const rawType = String(raw?.type ?? '');
    if (!SITE_FEATURE_TYPES.includes(rawType)) continue;
    const type = SITE_FEATURE_FOLD[rawType] || rawType;
    const count = Math.round(Number(raw?.count));
    if (!Number.isFinite(count) || count <= 0) continue;
    const len = Number(raw?.lengthFt);
    const lengthFt = LINEAR_SITE_FEATURES.has(type) && Number.isFinite(len) && len > 0 ? Math.round(len) : null;
    // A courtyard row written before 10-14 at the standard 60 ft each kept
    // its count only in the feet (2 courtyards = 120 ft, count 1). Read it
    // back as a count; a measured length is simply ignored now.
    const legacyCount = type === 'courtyard' && raw?.lengthAssumed === true ? courtyardsFromFt(len) : 0;
    const label = String(raw?.label ?? '').trim().slice(0, 80) || null;
    const prev = byType.get(type);
    if (prev) {
      prev.count += Math.max(count, legacyCount);
      if (lengthFt != null) prev.lengthFt = (prev.lengthFt ?? 0) + lengthFt;
      if (!prev.label && label) prev.label = label;
    } else {
      byType.set(type, { type, count: Math.max(count, legacyCount), lengthFt, label, sheet: raw?.sheet ?? page ?? null });
    }
  }
  return SITE_FEATURE_TYPES.filter(t => byType.has(t)).map(t => byType.get(t));
}

/**
 * The takeoff / questionnaire row key for each feature type, and back.
 * Counts for the per-count kinds, feet for the linear ones.
 */
export const SITE_FEATURE_ROW_KEYS = {
  dogPark:         'dogParks',
  courtyard:       'courtyards',
  playground:      'playgrounds',
  tennisCourt:     'tennisCourts',
  pickleballCourt: 'pickleballCourts',
  turfPlay:        'turfPlayFt',
};

/** Row key → feature type (the reverse of SITE_FEATURE_ROW_KEYS). */
export const SITE_FEATURE_TYPE_BY_ROW_KEY = {
  ...Object.fromEntries(Object.entries(SITE_FEATURE_ROW_KEYS).map(([type, key]) => [key, type])),
  [LEGACY_COURTYARD_FT_KEY]: 'courtyard', // old grids and drafts still send feet
};

/** Grid labels for the six flat row keys, in display order. */
export const SITE_FEATURE_ROW_LABELS = {
  dogParks:         '# Dog Parks',
  courtyards:       '# Courtyards',
  playgrounds:      '# Dog Parks / Playgrounds',
  tennisCourts:     '# Tennis / Pickleball Courts',
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
