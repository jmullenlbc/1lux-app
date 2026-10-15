/**
 * The bridge between what a site plan says and what Project Info stores.
 *
 * ── Why this is its own module ───────────────────────────────────────────────
 * `siteVision.js` reads a drawing and reports it in the drawing's own words —
 * "16.50 Ac", "PROVIDED 680", "CLUBHOUSE 4,200 SF". Project Info stores
 * `lotSf`, `numSurfaceParking`, `interiorAmenitySf`. Those are not the same
 * vocabulary, and the translation between them is a decision (does "amenity SF"
 * on a site plan mean the exterior amenity field or the interior one?) rather
 * than a detail.
 *
 * Putting that translation here, pure and alone, buys three things:
 *   1. `autoChecks.js` can reconcile lot area without importing `siteVision.js`,
 *      which statically pulls in @napi-rs/canvas — a native binary that has no
 *      business inside a unit test or inside the checks module.
 *   2. The acre → SF conversion has exactly one home. The vision prompt is told
 *      NOT to convert ("If only acres are given, still fill lotAcres and leave
 *      lotSf null"), precisely so the conversion happens here, visibly, where a
 *      reviewer can see both numbers instead of a model's arithmetic.
 *   3. The field list is auditable. Whatever is not in SITE_FIELD_DEFS cannot be
 *      written to a project by this extractor, no matter what the model returns.
 *
 * ── What is deliberately NOT proposed ────────────────────────────────────────
 * `numUnits` — the unit matrix owns it. A site plan's "324 D.U." is genuinely
 * useful, but as a CHECK against a matrix a human already accepted, not as a
 * second writer to the same field. Two extractors racing for one number is how
 * an accepted value gets silently overwritten by a less careful read. It is
 * reconciled in autoChecks.js and shown to the reviewer; it is never written.
 *
 * `numExteriorDoors`, `buildingFootprintSf` — not on a site data block, and not
 * countable by eye without violating the one rule the vision prompt is built on.
 *
 * Pure: no IO, no model, no clock.
 *
 * @see src/lib/siteVision.js        — the extraction this translates
 * @see src/lib/agent/autoChecks.js  — the arithmetic that grades it
 * @see scripts/tests/siteFields.test.mjs
 */
import { estimateStairLandings } from './stairLandings.js';
import { SITE_FEATURE_TYPES, SITE_FEATURE_LABELS, LINEAR_SITE_FEATURES, normalizeSiteFeatures } from './siteFeatures.js';

/**
 * A stated number, or NaN.
 *
 * The whole module turns on this. `Number(null)` is `0` and `Number.isFinite(0)`
 * is `true`, so the obvious guard silently converts "the drawing did not say"
 * into "the drawing said zero" — which is the exact failure this file exists to
 * prevent, since a blank Project Info field is visible in the missing-inputs
 * warning and a zero prices at $0 indistinguishably from a real one.
 */
export function stated(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Square feet in an acre. Exact, by definition. */
export const ACRE_SF = 43560;

/**
 * The engine's building-type keys — the same nine as BUILDING_TYPES in
 * src/lib/utils.js, listed here so this module stays free of UI imports.
 * Anything the drawing reader returns that is not one of these is not a type.
 */
export const BUILDING_TYPE_KEYS = [
  'singleFamily', 'townHouses', 'stackedFlats', 'garden', 'gurban',
  'wrap', 'podium', 'midRise', 'highRise',
];

/**
 * The building type as the drawing reader reported it, as an engine key.
 *
 * The reader is asked for the key itself ("garden", "podium" …), but it is a
 * model reading a title block, and the older reads on file are free text
 * ("3-STORY GARDEN WALK-UP"). Both are accepted; anything that does not
 * resolve is null, never a default — a wrong type re-prices the stair
 * package, the wall packs and the controls cap all at once.
 */
export function buildingTypeKeyFromText(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (BUILDING_TYPE_KEYS.includes(s)) return s;
  const t = s.toLowerCase().replace(/[_\s-]+/g, ' ');
  if (t.includes('single'))                                          return 'singleFamily';
  if (t.includes('stacked'))                                         return 'stackedFlats';
  if (t.includes('townhome') || t.includes('townhouse') || t.includes('town house') || t.includes('rowhouse') || t.includes('row house')) return 'townHouses';
  if (t.includes('high rise') || t.includes('highrise') || t.includes('high-rise')) return 'highRise';
  if (t.includes('mid rise')  || t.includes('midrise')  || t.includes('mid-rise'))  return 'midRise';
  if (t.includes('podium'))                                          return 'podium';
  if (t.includes('wrap'))                                            return 'wrap';
  if (t.includes('gurban') || t.includes('urban garden'))            return 'gurban';
  // A 4–5 story garden / walk-up IS a gurban — that is the whole distinction.
  if ((t.includes('garden') || t.includes('walk')) && /\b[45]\b|\b[45] ?stor/.test(t)) return 'gurban';
  if (t.includes('garden') || t.includes('walk up') || t.includes('walkup') || t.includes('breezeway')) return 'garden';
  return null;
}

const BUILDING_TYPE_LABELS = {
  singleFamily: 'Single Family (1-2 Levels)',
  townHouses:   'Town Houses (2-3 Levels)',
  stackedFlats: 'Town House / Stacked Flats (3 Levels)',
  garden:       'Garden (3 Levels)',
  gurban:       'Gurban (4-5 Levels)',
  wrap:         'Wrap (3-5 Levels)',
  podium:       'Podium (3-8 Levels)',
  midRise:      'Mid Rise (9-12 Levels)',
  highRise:     'High Rise (12+ Levels)',
};

/**
 * Land consumed by ONE surface stall including its share of drive aisle.
 *
 * Standard site-planning figure: a 9x18 stall is 162 SF, and 90-degree parking
 * with a 24' two-way aisle lands around 300–350 SF per stall all-in. 300 is the
 * low end on purpose — this number is only ever used to prove that a stall count
 * CANNOT fit on a lot, so the check should fire on "1,200 stalls on a 2-acre
 * site", never on an efficiently laid-out one.
 */
export const SURFACE_STALL_SF = 300;

/**
 * Lot area in square feet, from whichever field the drawing filled.
 *
 * `lotSf` wins when both are present — a stated SF figure was read as digits,
 * while acreage on these drawings is usually a hand-lettered decimal, which is
 * the single most misread thing on the page (16.56 / 16.86 against a true
 * 16.50 across three render resolutions).
 *
 * @returns {{sf: number, from: 'lotSf'|'lotAcres', acres: number|null}|null}
 */
export function lotSquareFeet(vision) {
  const sf = stated(vision?.lotSf);
  const acres = stated(vision?.lotAcres);
  if (sf > 0) return { sf, from: 'lotSf', acres: acres > 0 ? acres : null };
  if (acres > 0) return { sf: Math.round(acres * ACRE_SF), from: 'lotAcres', acres };
  return null;
}

/** Total stalls the drawing broke out by type, or null when it broke out none. */
export function stallBreakdown(vision) {
  const parts = [
    ['surface',  stated(vision?.surfaceParking)],
    ['carports', stated(vision?.carports)],
    ['garages',  stated(vision?.garages)],
  ].filter(([, v]) => Number.isFinite(v));

  if (!parts.length) return null;
  return {
    total: parts.reduce((n, [, v]) => n + v, 0),
    kinds: parts.map(([k]) => k),
    complete: parts.length === 3,
  };
}

/**
 * The Project Info fields this extractor is allowed to propose.
 *
 * `read` pulls the value out of the vision output. Returning null means "the
 * drawing did not say", which is a first-class answer here — the whole vision
 * prompt is built around returning null rather than estimating, and a field that
 * arrives null must stay out of the proposal rather than be written as zero. A
 * blank field in Project Info is visible in the missing-inputs warning; a zero
 * is indistinguishable from a real zero and silently prices at $0.
 *
 * @see src/lib/projectInputChecks.js — three of these are on the critical list
 */
export const SITE_FIELD_DEFS = [
  {
    // The one non-numeric field. It lives on Project (buildingType), not on
    // ProjectData — the commit route routes it there. Mike 2026-09-05: "can't
    // you analyze the site and look for something in the drawings that says
    // what it is?" The reader is given decision rules (breezeway + 3 stories
    // = garden, podium level = podium, …) and returns one engine key or null.
    key:   'buildingType',
    label: 'Building Type',
    unit:  'type',
    read: (v) => {
      const key = buildingTypeKeyFromText(v?.buildingType);
      if (!key) return null;
      const raw = String(v?.buildingType ?? '').trim();
      return {
        value: key,
        note: `Read as ${BUILDING_TYPE_LABELS[key]}${raw && raw !== key ? ` (the drawing said "${raw}")` : ''}. ` +
              'Drives the stair package (breezeway vs enclosed), building wall packs and the controls cap — confirm it.',
      };
    },
  },
  {
    key:   'grossSf',
    label: 'Total Building Gross SF',
    unit:  'sf',
    read: (v) => {
      const r = num(v?.grossSf);
      if (!r) return null;
      // The engine prices most interior scopes per square foot, so this one
      // figure scales more dollars than any other field on this list. The
      // prompt asks for the GROSS total when a sheet prints both gross and
      // net, but the two labels sit a line apart on a crowded area summary --
      // the reviewer confirms which one actually got read.
      return { ...r, note: 'Read as the stated TOTAL BUILDING GROSS square footage, not net or rentable. Confirm the label on the drawing.' };
    },
  },
  {
    key:   'lotSf',
    label: 'Lot Size SF',
    unit:  'sf',
    critical: true,
    read: (v) => {
      const lot = lotSquareFeet(v);
      if (!lot) return null;
      return {
        value: lot.sf,
        // The reviewer sees the arithmetic, not just its result.
        note: lot.from === 'lotAcres'
          ? `Converted from ${lot.acres} acres x ${ACRE_SF.toLocaleString()} SF. Hand-lettered acreage is the most misread figure on a site plan — confirm it.`
          : null,
      };
    },
  },
  {
    key:   'numSurfaceParking',
    label: '# Surface Parking Stalls',
    unit:  'count',
    critical: true,
    read: (v) => num(v?.surfaceParking),
  },
  {
    key:   'numCarports',
    label: '# Carports',
    unit:  'count',
    read: (v) => {
      // Stated ("COVERED PARKING: 40" in a parking table) wins; otherwise the
      // stalls counted under carport / canopy symbols on the site plan, or the
      // printed canopy areas ÷ 189 SF a stall (Mike 2026-09-16: "If it isn't
      // stated ... can you not figure it out from a site drawing?").
      const r = num(v?.carports);
      if (r) return r;
      const c = num(v?.carportsCounted);
      if (!c) return null;
      return { ...c, note: 'COUNTED off the site plan (carport bays, or canopy areas ÷ 189 SF a stall) — no carport count was written. Confirm the count.' };
    },
  },
  {
    key:   'numGarages',
    label: '# Detached/Attached Garages',
    unit:  'count',
    read: (v) => num(v?.garages),
  },
  {
    key:   'numBuildings',
    label: '# Buildings',
    unit:  'count',
    read: (v) => {
      const r = num(v?.buildingCount);
      // Not a cosmetic stat: calculations.js uses numBuildings ahead of the
      // walk-up fallback to size building wallpacks, so a wrong count changes
      // fixture quantities. Site data blocks also often include a standalone
      // clubhouse in their building total, and Project Info's definition
      // excludes it — hence the reviewer prompt.
      if (r) return { ...r, note: 'Drives building wallpack counts and the stair-landing multiply. Confirm it counts residential buildings only — a standalone clubhouse should not be included.' };
      // Nothing written: the building labels counted on the site plan
      // ("BLDG 1" … "BLDG 4"), flagged as a count.
      const c = num(v?.buildingsCounted);
      if (!c) return null;
      return { ...c, note: 'COUNTED from the building labels on the site plan — no building count was written. Drives wallpacks and the stair-landing multiply; confirm it.' };
    },
  },
  {
    key:   'numEgressStairwells',
    label: '# Egress Stairwell Landings',
    unit:  'count',
    read: (v) => {
      // The Project Data field holds LANDINGS ($200 each), not shafts. Mike's
      // ladder (2026-09-05): drawings (stories × stairs, stated or counted)
      // → building-code estimate → the human types it. The shared estimator
      // adds the 10% contingency; the note shows every step so the reviewer
      // can see what was read and what was assumed.
      // The building type the reader found (if any) steers the code fallback:
      // breezeway walk-ups pack more stairs per plate than a corridor building,
      // townhouse stairs are private. No type → the corridor factor.
      // A stair count off the drawings is what ONE building shows (a code
      // summary or a floor plan describes one building), so it is per
      // building and multiplied by the building count (Mike 2026-09-16: "We
      // counted 48, you counted 17" — buildings × stairs × (2N−1)).
      const est = estimateStairLandings({
        stories:           v?.stories ?? v?.storiesCounted,
        stairsPerBuilding: v?.egressStairwells ?? v?.egressStairwellsCounted,
        buildings:         v?.buildingCount ?? v?.buildingsCounted,
        footprintSf:     v?.buildingFootprintSf ?? v?.buildingFootprintSfMeasured,
        grossSf:         v?.grossSf,
        buildingTypeKey: buildingTypeKeyFromText(v?.buildingType),
      });
      if (!est) return null;
      const counted = (v?.stories == null && v?.storiesCounted != null)
                   || (v?.egressStairwells == null && v?.egressStairwellsCounted != null);
      const note = [
        est.how,
        est.flag,
        !est.estimated && counted ? 'Built on a COUNTED story or stair figure — confirm it before accepting.' : null,
      ].filter(Boolean).join(' ');
      return { value: est.landings, note };
    },
  },
  {
    key:   'exteriorAmenitySf',
    label: 'Exterior Amenity SF',
    unit:  'sf',
    critical: true,
    read: (v) => {
      const r = num(v?.amenitySf);
      // "AMENITY AREA" on a site plan is usually the outdoor programme — pool
      // deck, courtyard, dog run. Usually is not always, so it is labelled as an
      // assumption rather than presented as a reading.
      if (r) return { ...r, note: 'Read as the outdoor amenity area. If this figure is the indoor amenity, clear it here and enter it in Project Info instead.' };
      // Nothing printed: the reader may have MEASURED the pool enclosure plus
      // the hardscape touching the clubhouse off a scaled sheet (Mike
      // 2026-09-16). A measurement is never as good as a printed figure, so
      // it says how it found its scale and asks to be confirmed.
      const m = num(v?.exteriorAmenitySfMeasured);
      if (!m) return null;
      return { ...m, note: `Measured off the sheet (scale basis: ${SCALE_BASIS_LABELS[v?.scaleBasis] || 'not stated'}) — pool enclosure plus the hardscape touching the clubhouse. Confirm before accepting.` };
    },
  },
  {
    key:   'interiorAmenitySf',
    label: 'Interior Amenity SF',
    unit:  'sf',
    read: (v) => {
      const r = num(v?.clubhouseSf);
      if (!r) return null;
      return { ...r, note: 'From the clubhouse figure on the drawing.' };
    },
  },
  // Townhomes and single family (Mike 10-2): "read it or estimate but not ask".
  // Measured off the site plan; the engine uses them for homes only.
  {
    key:   'driveLengthFt',
    label: 'Private Drive Length (ft)',
    unit:  'ft',
    read: (v) => {
      const m = num(v?.driveLengthFtMeasured);
      if (!m || !m.value) return null;
      return { ...m, note: `Measured off the site plan (scale basis: ${SCALE_BASIS_LABELS[v?.scaleBasis] || 'not stated'}): every private drive aisle. Townhomes and single family get 1 pole light per 81 ft. Confirm before accepting.` };
    },
  },
  {
    key:   'walkwayLengthFt',
    label: 'Walkway Length (ft)',
    unit:  'ft',
    read: (v) => {
      const m = num(v?.walkwayLengthFtMeasured);
      if (!m || !m.value) return null;
      return { ...m, note: `Measured off the site plan (scale basis: ${SCALE_BASIS_LABELS[v?.scaleBasis] || 'not stated'}). Townhomes and single family get 1 bollard / pedestrian pole per 40 ft. Confirm before accepting.` };
    },
  },
];

function num(v) {
  const n = stated(v);
  return Number.isFinite(n) && n >= 0 ? { value: n, note: null } : null;
}

/** How the vision read found a scale for a measured figure, in plain words. */
export const SCALE_BASIS_LABELS = {
  scale:     'the printed scale',
  dimension: 'a printed dimension',
  stall:     'a standard 9 ft parking stall',
  door:      'a 3 ft door — the weakest rung, check it',
};

/**
 * The site features (dog park, courtyard, ...) the read found, as proposal
 * rows alongside the numbers. They are not ProjectData columns — the commit
 * route writes each accepted one as its own SiteFeature row — so they carry
 * a `siteFeature.<type>` key the allowlist recognises on its own.
 *
 * @param {object} vision        output of extractSiteData()
 * @param {Array}  [currentRows] the project's live SiteFeature rows
 */
export function proposeSiteFeatures(vision, currentRows = null) {
  const found = normalizeSiteFeatures(vision?.siteFeatures);
  const live = new Map((Array.isArray(currentRows) ? currentRows : [])
    .filter(r => r && !r.archivedAt).map(r => [r.type, r]));
  return found.map(f => {
    const linear = LINEAR_SITE_FEATURES.has(f.type);
    const value = linear ? f.lengthFt : f.count;
    const cur = live.get(f.type);
    const currentValue = cur ? (linear ? cur.lengthFt : cur.count) : null;
    return {
      key:        siteFeatureKey(f.type),
      type:       f.type,
      label:      SITE_FEATURE_LABELS[f.type] + (linear ? ' length' : 's'),
      unit:       linear ? 'ft' : 'count',
      value,
      count:      f.count,
      lengthFt:   f.lengthFt,
      lengthAssumed: f.lengthAssumed === true,
      sheet:      f.sheet ?? null,
      current:    currentValue,
      confidence: vision?.confidence ?? null,
      note:       [
        f.label ? `Labelled "${f.label}" on the drawing.` : 'Found by its printed label on the drawing.',
        linear && f.lengthFt == null ? 'No length could be measured. Enter the longest dimension in feet to price it.' : null,
        linear && f.lengthFt != null ? 'Length measured off the sheet. Confirm.' : null,
      ].filter(Boolean).join(' '),
      critical:   false,
      overwrites: currentValue != null && Number(currentValue) !== Number(value),
    };
  });
}

/** The proposal / commit key for one site-feature kind. */
export function siteFeatureKey(type) { return `siteFeature.${type}`; }

/** The kind behind a `siteFeature.<type>` key, or null. */
export function siteFeatureTypeFromKey(key) {
  const m = /^siteFeature\.([A-Za-z]+)$/.exec(String(key ?? ''));
  return m && SITE_FEATURE_TYPES.includes(m[1]) ? m[1] : null;
}

/**
 * Turn a vision reading into the rows the review panel shows and the commit
 * route writes.
 *
 * Every row starts unchecked-by-nothing: `value` is the model's proposal and
 * `include` is a suggestion, not a decision. Nothing here writes anything — the
 * human ticking boxes in the panel is the write.
 *
 * @param {object} vision  output of extractSiteData()
 * @param {object} [current]  the project's existing ProjectData, to show what
 *                            each proposal would replace
 * @returns {Array<{key,label,unit,value,current,confidence,note,critical,overwrites}>}
 */
export function proposeSiteFields(vision, current = null) {
  const rows = [];
  for (const def of SITE_FIELD_DEFS) {
    const read = def.read(vision);
    if (!read || read.value == null) continue;

    const currentValue = current?.[def.key] ?? null;
    rows.push({
      key:        def.key,
      label:      def.label,
      unit:       def.unit,
      value:      read.value,
      current:    currentValue,
      // The drawing gets one confidence for the whole read; there is no
      // per-field signal to invent a better one from.
      confidence: vision?.confidence ?? null,
      note:       read.note,
      critical:   !!def.critical,
      // Replacing a number somebody already entered is a different decision from
      // filling a blank, so the panel needs to be able to say which it is.
      overwrites: currentValue != null && currentValue !== '' && (
        def.unit === 'type'
          ? String(currentValue) !== String(read.value)
          : Number(currentValue) !== Number(read.value)
      ),
    });
  }
  return rows;
}

/** The keys a commit is permitted to write. Anything else is dropped. */
export function writableSiteKeys() {
  return SITE_FIELD_DEFS.map(d => d.key);
}

/** The keys that belong on Project rather than ProjectData. */
export function projectLevelSiteKeys() {
  return SITE_FIELD_DEFS.filter(d => d.unit === 'type').map(d => d.key);
}

/** Human label for a building-type key, for notes and diffs. */
export function buildingTypeKeyLabel(key) {
  return BUILDING_TYPE_LABELS[key] || key || '—';
}
