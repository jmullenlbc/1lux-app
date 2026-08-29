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
    read: (v) => num(v?.carports),
  },
  {
    key:   'numGarages',
    label: '# Garages',
    unit:  'count',
    read: (v) => num(v?.garages),
  },
  {
    key:   'numBuildings',
    label: '# Buildings',
    unit:  'count',
    read: (v) => {
      const r = num(v?.buildingCount);
      if (!r) return null;
      // Not a cosmetic stat: calculations.js uses numBuildings ahead of the
      // walk-up fallback to size building wallpacks, so a wrong count changes
      // fixture quantities. Site data blocks also often include a standalone
      // clubhouse in their building total, and Project Info's definition
      // excludes it — hence the reviewer prompt.
      return { ...r, note: 'Drives building wallpack counts. Confirm it counts residential buildings only — a standalone clubhouse should not be included.' };
    },
  },
  {
    key:   'exteriorAmenitySf',
    label: 'Exterior Amenity SF',
    unit:  'sf',
    critical: true,
    read: (v) => {
      const r = num(v?.amenitySf);
      if (!r) return null;
      // "AMENITY AREA" on a site plan is usually the outdoor programme — pool
      // deck, courtyard, dog run. Usually is not always, so it is labelled as an
      // assumption rather than presented as a reading.
      return { ...r, note: 'Read as the outdoor amenity area. If this figure is the indoor amenity, clear it here and enter it in Project Info instead.' };
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
];

function num(v) {
  const n = stated(v);
  return Number.isFinite(n) && n >= 0 ? { value: n, note: null } : null;
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
      overwrites: currentValue != null && Number(currentValue) !== Number(read.value),
    });
  }
  return rows;
}

/** The keys a commit is permitted to write. Anything else is dropped. */
export function writableSiteKeys() {
  return SITE_FIELD_DEFS.map(d => d.key);
}
