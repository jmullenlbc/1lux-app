/**
 * Fixture kinds for Bid Comparison (Mike 10-21). Pure.
 *
 * A kind is what a line IS (disk, downlight, ceiling fan), read from its
 * description and catalog words. Each kind says whether size matters (a 4"
 * disk and a 7" disk are different prices) and explains builder grade vs spec
 * grade to the people reading a comparison:
 *   a 48 to 55 inch builder grade pull chain fan is about $80 to $185 each,
 *   a 48 to 55 inch spec grade modern hugger fan is about $200 to $400 each
 *   (typically 53"); large amenity fans (56" and up) are their own kind.
 * Sage Brands (Eluma, Ascent, Candela, Lynx, Terrain, Dunton House, Peacock)
 * are ILC's cross for most white goods; a sageOnly kind (garage) is only ever
 * Sage Brands, so grade does not split it (Mike 10-22).
 *
 * The lists below live in code for now; staff read them on Admin > Users and
 * settings > Fixture kinds (read only). The engine only ever reads plain
 * objects, so tests and scripts run without a database.
 *
 * Words are plain phrases, not code: "PULL CHAIN" matches PULL CHAIN,
 * PULLCHAIN and PULL-CHAIN as whole words; a trailing * matches any ending
 * ("WRAP*" matches WRAPAROUND).
 */

import { normMfr } from '../specSwap/family.js';

const w = (s) => s.split('|').map((x) => x.trim()).filter(Boolean);

// Order matters: the first kind whose words match wins, so narrow kinds
// (a lamp, a driver, a fan) come before broad ones (disk, downlight).
// match reads the kind, not stops it (a disk "rated for a ceiling fan brace"
// is not a fan), builder / spec words name the grade outright.
export const DEFAULT_KINDS = [
  { key: 'lamp', name: 'Lamp (bulb)', sizeUnit: null,
    match: w('LAMP|LAMPS|BULB*|SCREW IN LAMP|A19|A21|BR30|BR40|PAR16|PAR20|PAR30|PAR38|MR16|G16|G25|ST19|ST64|CANDELABRA|E12|E26|G9|GU10|GU24'),
    not: w('LAMPHOLDER|LAMP POST|WITH LAMP|LAMP INCLUDED|LAMPS INCLUDED|FLOOR LAMP|TABLE LAMP|WALL LAMP|DESK LAMP'),
    builderNote: 'A standard screw in LED bulb.', specNote: 'A decorative or specialty bulb (filament, dim to warm, high CRI).',
    builderLow: 2, builderHigh: 8, specLow: 8, specHigh: 30 },
  { key: 'driver', name: 'Power supply or driver', sizeUnit: null,
    match: w('DRIVER|DRIVERS|POWER SUPPLY|POWER SUPPLIES|TRANSFORMER'),
    not: w('REMOTE DRIVER|INTEGRAL DRIVER|WITH DRIVER|W/ DRIVER|TAPE|STRIP|CHANNEL'),
    builderNote: 'A plain non dimming driver.', specNote: 'A dimming driver (0 to 10V, ELV, DALI) or a large class 2 supply.',
    builderLow: 20, builderHigh: 60, specLow: 60, specHigh: 250 },
  { key: 'inverter', name: 'Inverter or central battery', sizeUnit: null,
    match: w('INVERTER*|CENTRAL BATTERY|EMERGENCY LIGHTING CONTROL'),
    builderNote: 'A small wall mount inverter.', specNote: 'A large central inverter with zones and dimming relays.',
    builderLow: 400, builderHigh: 1500, specLow: 1500, specHigh: 9000 },
  // A large fan needs its size read (56" and up); a fan with no size reads as
  // the usual 48 to 55 inch fan.
  { key: 'fanLarge', name: 'Large amenity fan', sizeUnit: 'IN', sizeMin: 56,
    match: w('FAN|FANS|CEILING FAN|CF'),
    not: w('FAN BRACE|FAN RATED BRACE|FAN BOX|FAN RATED|EXHAUST FAN|FAN LIGHT KIT'),
    builderNote: 'Large fans (56" and up) are for amenity areas, not units.',
    specNote: 'Large amenity fans vary widely, so we compare the bids.',
    builderLow: null, builderHigh: null, specLow: null, specHigh: null },
  { key: 'fan', name: 'Ceiling fan', sizeUnit: 'IN', sizeMax: 55,
    match: w('FAN|FANS|CEILING FAN|CF'),
    not: w('FAN BRACE|FAN RATED BRACE|FAN BOX|FAN RATED|EXHAUST FAN|FAN LIGHT KIT'),
    builder: w('PULL CHAIN|BUILDER*|CONTRACTOR'), spec: w('DC MOTOR|SMART|WIFI|WI FI'),
    builderNote: 'A builder grade 48 to 55 inch fan: pull chain or basic wall control, plain blades, standard motor.',
    specNote: 'A spec grade 48 to 55 inch fan (typically 53"): modern hugger or designer look, DC motor, remote or smart control, better finishes.',
    builderLow: 80, builderHigh: 185, specLow: 200, specHigh: 400 },
  { key: 'exit', name: 'Exit sign or emergency light', sizeUnit: null,
    match: w('EXIT|EXITS|EMERG*|FROG EYE*|FROGEYE*|BUG EYE*|EGRESS|BATTERY PACK|EM BATTERY|BATTERY BACK*|REMOTE HEAD*|2HD|PHOTOLUMINESCENT|GRN LTR|RED LTR|SGL FACE|DBL FACE'),
    builder: w('THERMOPLASTIC'), spec: w('DIE CAST|ALUMINUM|EDGE LIT|EDGELIT'),
    builderNote: 'A thermoplastic exit sign or two head emergency light.', specNote: 'An edge lit, die cast or recessed exit sign or remote head.',
    builderLow: 20, builderHigh: 60, specLow: 80, specHigh: 400 },
  { key: 'pole', name: 'Pole or area light', sizeUnit: null,
    match: w('POLE|POLES|AREA LIGHT*|AREA STYLE|PARKING LOT|SHOEBOX|COBRA*|ROADWAY|SITE LIGHT*|SITE LUMINAIRE|SITE|POST TOP|POST LIGHT|STREET LIGHT*|STREETLIGHT*|PEDESTRIAN'),
    builderNote: 'A standard shoebox head on a square steel pole.', specNote: 'A decorative post top, round tapered pole or architectural head.',
    builderLow: 300, builderHigh: 900, specLow: 900, specHigh: 4000 },
  { key: 'bollard', name: 'Bollard', sizeUnit: null,
    match: w('BOLLARD*'),
    builderNote: 'A plain round bollard.', specNote: 'An architectural bollard with glare control.',
    builderLow: 150, builderHigh: 450, specLow: 450, specHigh: 2000 },
  { key: 'step', name: 'Step or stair light', sizeUnit: null,
    match: w('STEP|STEPLIGHT*|STEP LIGHT*|STAIR*|HANDRAIL*'),
    builderNote: 'A small plastic face step light.', specNote: 'A die cast step light or a handrail light.',
    builderLow: 15, builderHigh: 60, specLow: 60, specHigh: 400 },
  { key: 'string', name: 'String or festoon lights', sizeUnit: null,
    match: w('STRING|STRING LIGHT*|FESTOON|CATENARY|BISTRO|STRAND'),
    builderNote: 'A retail string light set.', specNote: 'A commercial catenary system with cable and hardware.',
    builderLow: 1, builderHigh: 15, specLow: 15, specHigh: 80 },
  { key: 'tape', name: 'Tape light (cove, under cabinet)', sizeUnit: null,
    match: w('TAPE|COVE|UNDER CAB*|UNDERCAB*|UC|FLEX|ROPE LIGHT|LED STRIP|LIGHT STRIP|LED CHANNEL'),
    builderNote: 'Plain tape in a basic channel, or a plug in under cabinet bar.', specNote: 'High CRI tape in an aluminum channel with a lens and a dimming driver.',
    builderLow: 3, builderHigh: 15, specLow: 15, specHigh: 60 },
  { key: 'troffer', name: 'Troffer or flat panel', sizeUnit: 'GRID',
    match: w('TROFFER*|FLAT PANEL|LED PANEL|1X4|2X2|2X4|1 X 4|2 X 2|2 X 4'),
    builderNote: 'A basic flat panel.', specNote: 'A volumetric or architectural troffer.',
    builderLow: 40, builderHigh: 90, specLow: 90, specHigh: 300 },
  { key: 'wrap', name: 'Wrap or strip light', sizeUnit: 'FT',
    match: w('WRAP*|STRIP|STRIPLIGHT*|STRIP LIGHT*|SHOP LIGHT|UTILITY LIGHT|CLOSET LIGHT'),
    builderNote: 'A plain wrap or strip for closets and utility rooms.', specNote: 'An architectural linear surface or slot.',
    builderLow: 20, builderHigh: 70, specLow: 70, specHigh: 300 },
  { key: 'linear', name: 'Architectural linear', sizeUnit: 'FT',
    match: w('LINEAR|SLOT'),
    builderNote: 'A basic linear fixture.', specNote: 'A recessed or suspended architectural linear system.',
    builderLow: 20, builderHigh: 60, specLow: 60, specHigh: 400 },
  { key: 'garage', name: 'Garage or vapor tight', sizeUnit: null, sageOnly: true,
    match: w('GARAGE|VAPOR*|VPR|CANOPY|PARKING STRUCTURE|PARKING DECK|PARKING GARAGE|GASKETED|ENCLOSED'),
    builderNote: 'ILC uses only Sage Brands (Eluma) garage fixtures, so there is no builder or spec split.', specNote: '',
    builderLow: null, builderHigh: null, specLow: null, specHigh: null },
  { key: 'wallpack', name: 'Wall pack', sizeUnit: null,
    match: w('WALL PACK*|WALLPACK*'),
    builderNote: 'A basic wall pack.', specNote: 'A full cutoff architectural wall pack.',
    builderLow: 50, builderHigh: 150, specLow: 150, specHigh: 600 },
  { key: 'mirror', name: 'Lighted mirror', sizeUnit: null,
    match: w('LIT MIRROR*|LIGHTED MIRROR*|LED MIRROR*|BACKLIT MIRROR*|MIRROR|MIRRORS'),
    not: w('MIRROR LIGHT'),
    builderNote: 'A plain front lit mirror.', specNote: 'A back lit or designer mirror with dimming and defog.',
    builderLow: 100, builderHigh: 350, specLow: 350, specHigh: 2500 },
  { key: 'vanity', name: 'Vanity light', sizeUnit: 'IN',
    match: w('VANITY|VANITIES|BATH BAR|BATHBAR|BATH LIGHT|MIRROR LIGHT'),
    builderNote: 'A builder grade bath bar.', specNote: 'A designer vanity light.',
    builderLow: 25, builderHigh: 90, specLow: 120, specHigh: 600 },
  { key: 'picture', name: 'Picture light', sizeUnit: null,
    match: w('PICTURE|ART LIGHT'),
    builderNote: 'A basic picture light.', specNote: 'A designer picture light.',
    builderLow: 40, builderHigh: 150, specLow: 150, specHigh: 600 },
  { key: 'chandelier', name: 'Chandelier', sizeUnit: null,
    match: w('CHANDELIER*|CHANDEILIER*'),
    builderNote: 'A builder grade chandelier.', specNote: 'A designer or custom chandelier.',
    builderLow: 100, builderHigh: 400, specLow: 400, specHigh: 10000 },
  { key: 'pendant', name: 'Pendant', sizeUnit: null,
    match: w('PENDANT*|HANGING|CORD|SUSPENDED'),
    not: w('LINEAR'),
    builderNote: 'A builder grade pendant.', specNote: 'A designer pendant.',
    builderLow: 30, builderHigh: 150, specLow: 150, specHigh: 1500 },
  { key: 'porch', name: 'Outdoor wall or porch light', sizeUnit: null,
    match: w('PORCH|PATIO|LANTERN*|EXTERIOR WALL|OUTDOOR WALL|BALCONY LIGHT|ENTRY LIGHT|COACH|OUTDOOR LIGHT|EXTERIOR LIGHT'),
    builderNote: 'A builder grade porch or patio light.', specNote: 'An architectural outdoor wall light.',
    builderLow: 20, builderHigh: 90, specLow: 120, specHigh: 700 },
  { key: 'sconce', name: 'Wall sconce', sizeUnit: null,
    match: w('SCONCE*|SONCE|BRACKET LIGHT|WALL MOUNT*|WALL LIGHT*|WALL FIXTURE*|WALL LUMINAIRE*|WALL'),
    builderNote: 'A builder grade sconce.', specNote: 'A designer sconce.',
    builderLow: 25, builderHigh: 120, specLow: 120, specHigh: 800 },
  { key: 'cylinder', name: 'Cylinder', sizeUnit: 'IN',
    match: w('CYLINDER*'),
    builderNote: 'A basic cylinder.', specNote: 'An architectural cylinder with a precise optic.',
    builderLow: 40, builderHigh: 150, specLow: 150, specHigh: 600 },
  { key: 'track', name: 'Track or monopoint', sizeUnit: null,
    match: w('TRACK*|MONOPOINT|ADJUSTABLE HEAD'),
    builderNote: 'A basic track head.', specNote: 'An architectural track head.',
    builderLow: 25, builderHigh: 90, specLow: 90, specHigh: 400 },
  { key: 'landscape', name: 'Landscape light', sizeUnit: null,
    match: w('LANDSCAPE|UPLIGHT*|IN GRADE|INGRADE|PATH|PATHWAY|PATH LIGHT*|TREE|FLOOD*|SPOT|SPOTLIGHT*|SPOT LIGHT*|ACCENT'),
    builderNote: 'A plastic or light gauge landscape light.', specNote: 'A brass or cast landscape light.',
    builderLow: 20, builderHigh: 80, specLow: 80, specHigh: 600 },
  { key: 'lampholder', name: 'Lampholder (keyless)', sizeUnit: null,
    match: w('LAMPHOLDER*|LAMP HOLDER*|KEYLESS|PORCELAIN'),
    builderNote: 'A porcelain keyless lampholder.', specNote: 'A decorative lampholder.',
    builderLow: 3, builderHigh: 12, specLow: 12, specHigh: 60 },
  { key: 'disk', name: 'Disk or flush mount', sizeUnit: 'IN',
    match: w('DISK|DISKS|DISC|DISCS|DIS K|PUCK*|SURFACE|FLUSH*|EDGE LIT|EDGELIT|CEILING MOUNT*|CEILING LIGHT|DOME|CIRCULAR'),
    builderNote: 'A builder grade LED disk or flush mount.', specNote: 'A designer flush mount or a regressed architectural disk.',
    builderLow: 8, builderHigh: 30, specLow: 40, specHigh: 400 },
  { key: 'wafer', name: 'Wafer (canless recessed)', sizeUnit: 'IN',
    match: w('WAFER*|CANLESS|SLIM RECESS*|ULTRA THIN'),
    builderNote: 'A builder grade canless wafer.', specNote: 'A canless downlight with a regressed trim and better optic.',
    builderLow: 8, builderHigh: 30, specLow: 40, specHigh: 200 },
  { key: 'downlight', name: 'Recessed downlight', sizeUnit: 'IN',
    match: w('DOWNLIGHT*|DOWN LIGHT*|DWNLGT|RECESS*|REC|CAN|CANS|DL|RETROFIT|HOUSING'),
    builderNote: 'A builder grade can and retrofit trim.', specNote: 'An architectural downlight with a deep regressed trim and precise optic.',
    builderLow: 10, builderHigh: 45, specLow: 60, specHigh: 400 },
  { key: 'decorative', name: 'Decorative or custom', sizeUnit: null, noTypical: true,
    match: w('DECORATIVE|CUSTOM|SCULPTURE|ART|FEATURE'),
    builderNote: 'Builder grade decorative fixtures are rare.', specNote: 'Custom and designer pieces vary widely, so we compare the bids, not a typical price.',
    builderLow: null, builderHigh: null, specLow: null, specHigh: null },
];

// Sage Brands, ILC's cross. One brand, Sage (Mike 10-22: the sub brands are
// not rated on their own). These are the names Sage products appear under in
// bids, so a line reads as Sage Brands under any of them (normMfr spelling; a
// longer name that starts with one counts, so "Ascent Architectural" is ASCENT).
export const SAGE_BRANDS = ['SAGE', 'ELUMA', 'ASCENT', 'CANDELA', 'LYNX', 'TERRAIN', 'DUNTON HOUSE', 'PEACOCK'];

const startsWithBrand = (nm, b) => nm === b || nm.startsWith(`${b} `);

/** True for Eluma and the Sage Brands. `sage` is the list staff keep on Admin (default SAGE_BRANDS). */
export function isSageBrand(mfr, sage = SAGE_BRANDS) {
  const nm = normMfr(mfr);
  return !!nm && [...sage].some((b) => startsWithBrand(nm, b));
}

// Brands that read one grade on their own (normMfr spelling). Minka sells
// both grades, so it is not listed; its lines fall back to words or price.
// Sage is not graded (Mike 10-22); its lines read their grade from the words.
export const DEFAULT_BRAND_GRADES = [
  ...['CRAFTMADE', 'GLOBALUX', 'LIGHTS DIRECT', 'HALO', 'ELITE', 'PROGRESS', 'NORA LIGHTING',
    'AFX', 'METALUX', 'LITHONIA', 'SATCO', 'NUVO', 'ACCESS LIGHTING', 'DURA LAMP', 'HUNTER', 'HARBOR BREEZE',
    'HAMPTON BAY', 'GLOBE', 'JUNO', 'CSL', 'MAXIM', 'SEA GULL', 'GENERATION LIGHTING', 'ILP INC', 'CANARM',
    'COLUMBIA', 'AMERICAN LIGHTING', 'BEST LIGHTING', 'NLS', 'ELCO', 'LUMARK', 'PHILIPS DAY-BRITE', 'DAY-BRITE']
    .map((brand) => ({ brand, grade: 'BUILDER' })),
  ...['VISUAL COMFORT', 'KUZCO', 'LUMENPULSE', 'GOTHAM', 'DMF', 'AMERLUX', 'LIGHTOLIER', 'BEGA', 'FANIMATION',
    'BIG ASS FANS', 'HINKLEY', 'TECH LIGHTING', 'WAC', 'LUMINII', 'PURE LIGHTING', 'DIODE LED', 'LUMENWERX',
    'SONNEMAN', 'MODERN FORMS', 'OXYGEN', 'KICHLER', 'BARRON', 'EUROFASE', 'CORE LIGHTING', 'SPJ', 'HAPCO',
    'FERROLUCE', 'SELUX', 'LUMIERE', 'HOLOPHANE', 'MCGRAW-EDISON', 'LITHOS', 'PABLO DESIGN', 'BROWNLEE LIGHTING',
    'ELECTRIC MIRROR', 'LIGHTOLOGY', 'TURF', 'RO SHAM BEAUX', 'BLOOM LIGHTING', 'ARTERIORS', 'LIGMAN',
    'PEARED CREATION', 'GARDCO', 'SIGNIFY GARDCO', 'FOCAL POINT', 'HE WILLIAMS', 'HUBBARDTON FORGE', 'BOVER',
    'RESTORATION HARDWARE', 'EELP', 'NUMERA', 'IOTA', 'INTENSE', 'EXITRONIX', 'TROY LIGHTING', 'KELVIX']
    .map((brand) => ({ brand, grade: 'SPEC' })),
];

// Brands that sell both grades: listed so staff see them, but the words decide.
export const DEFAULT_BOTH_BRANDS = ['MINKA AIRE', 'COOPER', 'ACUITY', 'HUBBELL'];

/**
 * Every default brand row as the BrandGrade table holds it (seeded on the first
 * edit). Sage is one row, flagged Sage Brands and not graded.
 */
export function defaultBrandRows() {
  const rows = DEFAULT_BRAND_GRADES.map((r) => ({ brand: r.brand, grade: r.grade, sage: false }));
  for (const b of DEFAULT_BOTH_BRANDS) rows.push({ brand: b, grade: 'BOTH', sage: false });
  rows.push({ brand: 'SAGE', grade: null, sage: true });
  return rows;
}

export const WORD_LISTS = { MATCH: 'match', NOT: 'not', BUILDER: 'builder', SPEC: 'spec' };

/**
 * FixtureKind + BrandGrade table rows to the rules the check reads. An empty
 * table means the defaults. Only APPROVED, not archived brand rows count.
 */
export function rulesFromRows(kindRows = [], brandRows = []) {
  const live = kindRows.filter((k) => !k.archivedAt);
  const kinds = live.length
    ? compileKinds(live.map((k) => {
      const out = { ...k };
      for (const [list, field] of Object.entries(WORD_LISTS)) {
        out[field] = (k.words || []).filter((x) => x.list === list).sort((a, b) => a.sortOrder - b.sortOrder).map((x) => x.phrase);
      }
      return out;
    }))
    : defaultKinds();
  const approved = brandRows.filter((b) => !b.archivedAt && (b.status ?? 'APPROVED') === 'APPROVED');
  const brands = brandRows.length ? brandGradeMap(approved) : defaultBrandGrades();
  // The Sage names in code always count; a flagged row adds a name.
  const sage = [...new Set([...SAGE_BRANDS, ...approved.filter((b) => b.sage).map((b) => normMfr(b.brand))])];
  return { kinds, brands, sage, fromDb: { kinds: live.length > 0, brands: brandRows.length > 0 } };
}

export const GRADE_LABEL = { BUILDER: 'Builder grade', SPEC: 'Spec grade' };
const GRADES = new Set(['BUILDER', 'SPEC']);

/** Normalize text the way phrases are written: upper case, curly quotes plain. */
export function normText(s) {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One phrase to a whole word pattern: spaces match a space, a dash or nothing. */
export function phraseRegex(phrase) {
  const p = normText(phrase);
  const star = p.endsWith('*');
  const body = (star ? p.slice(0, -1) : p)
    .split(' ')
    .filter(Boolean)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s-]*');
  return new RegExp(`(?<![A-Z0-9])${body}${star ? '[A-Z0-9]*' : ''}(?![A-Z0-9])`);
}

const compileWords = (list) => (list || []).filter(Boolean).map(phraseRegex);

/** Kinds with their words compiled once. Accepts DB-shaped rows or the defaults. */
export function compileKinds(kinds = DEFAULT_KINDS) {
  return kinds
    .filter((k) => !k.archivedAt)
    .map((k, i) => ({
      ...k,
      sortOrder: k.sortOrder ?? i,
      _match: compileWords(k.match),
      _not: compileWords(k.not),
      _builder: compileWords(k.builder),
      _spec: compileWords(k.spec),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

let compiledDefaults = null;
export const defaultKinds = () => compiledDefaults || (compiledDefaults = compileKinds(DEFAULT_KINDS));

const firstLine = (s) => String(s ?? '').split(/\r?\n/)[0];

/**
 * A kind with sizeMin needs a read size at or over it; sizeMax turns away only
 * a read size over it (a fan with no size is the usual 48 to 55 inch fan).
 */
function sizeFits(line, k) {
  if (k.sizeMin == null && k.sizeMax == null) return true;
  const n = parseFloat(sizeOf(line, k));
  if (k.sizeMin != null && !(n >= k.sizeMin)) return false;
  if (k.sizeMax != null && n > k.sizeMax) return false;
  return true;
}

/**
 * The kind a line reads as, or null. The description alone is read first so
 * catalog codes (E26 in a patio light's part number) never outvote it.
 */
export function matchKind(line, kinds = defaultKinds()) {
  const desc = normText(line.description);
  const cat = normText(firstLine(line.catalog));
  const passes = desc ? [desc, `${desc} ${cat}`.trim()] : [cat];
  for (const text of passes) {
    if (!text) continue;
    for (const k of kinds) {
      if (k._not.some((r) => r.test(text))) continue;
      if (k._match.some((r) => r.test(text)) && sizeFits(line, k)) return k;
    }
  }
  return null;
}

const IN_RE = /(\d{1,2}(?:\.\d+)?)\s*(?:"|''|IN\b|INCH)/;
const FT_RE = /(\d{1,2}(?:\.\d+)?)\s*(?:'(?!')|FT\b|FOOT|FEET)/;
const GRID_RE = /\b([12])\s*X\s*([24])\b/;
const CATALOG_SIZE_RE = /^[A-Z]{2,4}-?(\d{1,2})(?:\b|-)/;

/**
 * Size that matters for the kind, as a short label ("7 in", "4 ft", "2x4"),
 * or null. Inches come from the words first, then a catalog prefix (DL-7,
 * CF-52). Only kinds with a sizeUnit get one.
 */
export function sizeOf(line, kind) {
  if (!kind || !kind.sizeUnit) return null;
  const cat = normText(firstLine(line.catalog));
  const both = `${normText(line.description)} ${cat}`;
  if (kind.sizeUnit === 'GRID') {
    const m = both.match(GRID_RE);
    return m ? `${m[1]}x${m[2]}` : null;
  }
  if (kind.sizeUnit === 'FT') {
    const m = both.match(FT_RE);
    if (m && Number(m[1]) > 0) return `${Math.round(Number(m[1]))} ft`;
    const i = both.match(IN_RE);
    if (i && Number(i[1]) >= 12) return `${Math.round(Number(i[1]) / 12)} ft`;
    return null;
  }
  let m = both.match(IN_RE);
  if (m && Number(m[1]) >= 2) return `${Math.round(Number(m[1]))} in`;
  m = cat.match(CATALOG_SIZE_RE);
  if (m && Number(m[1]) >= 3) return `${Number(m[1])} in`;
  return null;
}

/** brand (normMfr spelling) to BUILDER | SPEC. */
export function brandGradeMap(rows = DEFAULT_BRAND_GRADES) {
  const m = new Map();
  for (const r of rows) {
    if (r && GRADES.has(r.grade) && !r.archivedAt && (r.status ?? 'APPROVED') === 'APPROVED') m.set(normMfr(r.brand), r.grade);
  }
  return m;
}

let defaultBrands = null;
export const defaultBrandGrades = () => defaultBrands || (defaultBrands = brandGradeMap());

/**
 * { grade: BUILDER | SPEC, by: 'words' | 'brand' }, or null when neither
 * says. Words beat the brand (a pull chain fan is builder grade whoever makes
 * it). Price never decides the grade; pricedLike only explains a price.
 */
export function gradeOf(line, kind, brands = defaultBrandGrades()) {
  const text = `${normText(line.description)} ${normText(firstLine(line.catalog))}`;
  if (kind) {
    if (kind._builder?.some((r) => r.test(text))) return { grade: 'BUILDER', by: 'words' };
    if (kind._spec?.some((r) => r.test(text))) return { grade: 'SPEC', by: 'words' };
  }
  const g = brandGrade(brands, line.mfr);
  return g ? { grade: g, by: 'brand' } : null;
}

/** A brand's grade, reading "HUNTER FAN CO" as HUNTER. */
export function brandGrade(brands, mfr) {
  const nm = normMfr(mfr);
  if (!nm) return null;
  if (brands.has(nm)) return brands.get(nm);
  for (const [b, g] of brands) if (startsWithBrand(nm, b)) return g;
  return null;
}

/**
 * Which grade's usual range a price sits in, for the explainer:
 * "priced like builder grade (about $80 to $185 each)". null when outside
 * both ranges or the kind has none.
 */
export function pricedLike(price, kind) {
  if (!kind || !(price > 0)) return null;
  const { builderLow: bl, builderHigh: bh, specLow: sl, specHigh: sh } = kind;
  if (bl != null && bh != null && price >= bl * 0.85 && price <= bh * 1.15) return 'BUILDER';
  if (sl != null && sh != null && price >= sl * 0.85 && price <= sh * 1.15) return 'SPEC';
  return null;
}

/** "about $80 to $185 each" for a kind and grade, or ''. */
export function rangeText(kind, grade, per = 'each') {
  if (!kind) return '';
  const lo = grade === 'SPEC' ? kind.specLow : kind.builderLow;
  const hi = grade === 'SPEC' ? kind.specHigh : kind.builderHigh;
  if (lo == null || hi == null) return '';
  const f = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `about ${f(lo)} to ${f(hi)} ${per}`;
}

/** EA, or FT for lines priced by the foot. */
export function basisOf(uom) {
  return /LINEAR|\bLF\b|\bFT\b|FEET|FOOT/i.test(String(uom || '')) ? 'FT' : 'EA';
}

/** Kind, size, grade and price basis for one line in one call. */
export function readLine(line, { kinds = defaultKinds(), brands = defaultBrandGrades() } = {}) {
  const kind = matchKind(line, kinds);
  return {
    kind,
    size: sizeOf(line, kind),
    grade: kind?.sageOnly ? null : gradeOf(line, kind, brands),
    basis: basisOf(line.uom),
  };
}
