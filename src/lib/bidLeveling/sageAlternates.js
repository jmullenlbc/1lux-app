/**
 * The Sage alternate column on the leveled sheet (Mike 10-28, bid step 3).
 * Pure, no database, safe in the browser.
 *
 * Each leveled row reads as one fixture kind from its words, and each kind has
 * the Sage name a GC sees ("Eluma 7 inch disk"): a plain name, never a part
 * number or a price. The list is the one Mike approved on 10-28
 * (26.10.28 Sage Alternates for Approval.xlsx):
 *   - main items and unit decoratives always get a Sage name
 *   - the unit entry sconce in corridors gets the Dunton House number sconce
 *   - other decoratives only when the quantity is over 50
 *   - lamps, drivers for other gear, large amenity fans, track and the like get none
 *
 * Kept apart from the Bid Comparison kind reader on purpose; that one is not live.
 */

export const SAGE_GROUP = {
  MAIN: 'Main item',
  UNIT: 'Unit decorative',
  ENTRY: 'Corridor unit entry',
  DECOR: 'Other decorative',
  NONE: 'No alternate',
};
export const DECOR_MIN_QTY = 50;

// Sage Brands names as they show up in bids; a line already on one needs no alternate.
const SAGE_MAKERS = ['SAGE', 'ELUMA', 'ASCENT', 'CANDELA', 'LYNX', 'TERRAIN', 'DUNTON HOUSE', 'PEACOCK'];

const norm = (s) => String(s ?? '').toUpperCase().replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/\s+/g, ' ').trim();

/** "PULL CHAIN" matches PULL CHAIN, PULLCHAIN, PULL-CHAIN as whole words; a trailing * matches any ending. */
function phrase(p) {
  const star = p.endsWith('*');
  const body = (star ? p.slice(0, -1) : p).split(' ').filter(Boolean)
    .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s-]*');
  return new RegExp(`(?<![A-Z0-9])${body}${star ? '[A-Z0-9]*' : ''}(?![A-Z0-9])`);
}
const words = (s) => s.split('|').map((x) => x.trim()).filter(Boolean).map(phrase);
const any = (list, text) => list.some((r) => r.test(text));

const IN_RE = /(\d{1,2}(?:\.\d+)?)\s*(?:"|''|IN\b|INCH)/;
const FT_RE = /(\d{1,2}(?:\.\d+)?)\s*(?:'(?!')|FT\b|FOOT|FEET)/;
const GRID_RE = /\b([12])\s*X\s*([24])\b/;
const CATALOG_IN_RE = /^[A-Z]{2,4}-?(\d{1,2})(?:\b|-)/;
const OPTIC_RE = /\bTYPE\s*(III|IV|V|2|3|4|5)\b|\bT([345])\b/;

function inches(text, catalog) {
  const m = text.match(IN_RE);
  if (m && Number(m[1]) >= 2) return Number(m[1]);
  const c = catalog.match(CATALOG_IN_RE);
  return c && Number(c[1]) >= 3 ? Number(c[1]) : null;
}
function feet(text) {
  const m = text.match(FT_RE);
  if (m && Number(m[1]) > 0) return Math.round(Number(m[1]));
  const i = text.match(IN_RE);
  return i && Number(i[1]) >= 12 ? Math.round(Number(i[1]) / 12) : null;
}
const nearest = (n, sizes) => (n == null ? null : sizes.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a)));
const inch = (n) => (n ? `${n} inch` : '');

const UNIT_WORDS = words('UNIT|UNITS|KITCHEN|ISLAND|DINING|APARTMENT|APT|RESIDEN*|DWELLING|CONDO');
const ENTRY_WORDS = words('UNIT ENTRY|UNIT DOOR|ENTRY DOOR|UNIT NUMBER|UNIT NO|DOOR NUMBER|ADDRESS|CORRIDOR|HALLWAY');
const SCONCE_WORDS = words('SCONCE*|WALL MOUNT*|WALL LIGHT*|WALL FIXTURE*|BRACKET LIGHT');
const EDGE_LIT = words('EDGE LIT|EDGELIT');

// Order matters: the first kind whose words match wins, so narrow kinds come
// before broad ones. name(t) gets { text, catalog } and returns the Sage name.
const KINDS = [
  { key: 'lamp', kind: 'Lamp (bulb)', group: 'NONE',
    match: words('LAMP|LAMPS|BULB*|A19|A21|BR30|BR40|PAR20|PAR30|PAR38|MR16|G25|GU10|GU24'),
    not: words('LAMPHOLDER*|LAMP HOLDER*|LAMP POST|WITH LAMP|LAMP INCLUDED|LAMPS INCLUDED|FLOOR LAMP|TABLE LAMP|WALL LAMP') },
  { key: 'lampholder', kind: 'Lampholder (keyless)', group: 'NONE', match: words('LAMPHOLDER*|LAMP HOLDER*|KEYLESS|PORCELAIN') },
  { key: 'inverter', kind: 'Inverter or central battery', group: 'NONE', match: words('INVERTER*|CENTRAL BATTERY') },
  { key: 'driver', kind: 'Power supply or driver', group: 'MAIN', name: () => 'Eluma tape light driver',
    match: words('DRIVER|DRIVERS|POWER SUPPLY|POWER SUPPLIES|TRANSFORMER'),
    not: words('INTEGRAL DRIVER|WITH DRIVER|W/ DRIVER|INCLUDES DRIVER|DRIVER INCLUDED') },
  { key: 'fanLarge', kind: 'Large amenity fan (56 in+)', group: 'NONE', fan: 'large',
    match: words('FAN|FANS|CEILING FAN'), not: words('FAN BRACE|FAN RATED*|FAN BOX|EXHAUST FAN|FAN LIGHT KIT') },
  { key: 'fan', kind: 'Ceiling fan (up to 55 in)', group: 'MAIN', fan: 'small', name: () => 'Eluma 52 inch ceiling fan with light',
    match: words('FAN|FANS|CEILING FAN'), not: words('FAN BRACE|FAN RATED*|FAN BOX|EXHAUST FAN|FAN LIGHT KIT') },
  { key: 'exit', kind: 'Exit sign', group: 'MAIN',
    name: (t) => (any(EDGE_LIT, t.text) ? 'Eluma edge lit exit sign' : 'Eluma exit sign'),
    match: words('EXIT|EXITS|EXIT SIGN*') },
  { key: 'emergency', kind: 'Emergency light', group: 'MAIN', name: () => 'Eluma dual head emergency light',
    match: words('EMERG*|FROG EYE*|FROGEYE*|BUG EYE*|EGRESS|BATTERY PACK|EM BATTERY|BATTERY BACK*|REMOTE HEAD*|2HD|TWO HEAD'),
    // A disk or wrap with a battery is still a disk or wrap.
    not: words('DISK|DISC|DOWNLIGHT*|WAFER*|WRAP*|STRIP|TROFFER*|FLAT PANEL|VANITY|PENDANT*|CYLINDER*|WALL PACK*|WALLPACK*|GARAGE|VAPOR*|AREA LIGHT*') },
  { key: 'mirror', kind: 'Lighted mirror', group: 'UNIT',
    name: (t) => `Eluma ${inch(inches(t.text, t.catalog))} lighted mirror`,
    match: words('LIT MIRROR*|LIGHTED MIRROR*|LED MIRROR*|BACKLIT MIRROR*|MIRROR|MIRRORS'), not: words('MIRROR LIGHT') },
  { key: 'vanity', kind: 'Vanity light', group: 'UNIT',
    name: (t) => `Eluma ${inch(nearest(inches(t.text, t.catalog), [24, 36]))} vanity bar`,
    match: words('VANITY|VANITIES|BATH BAR|BATHBAR|BATH LIGHT|MIRROR LIGHT') },
  { key: 'entry', kind: 'Unit entry sconce (corridor)', group: 'ENTRY', name: () => 'Dunton House unit number sconce',
    all: [SCONCE_WORDS, ENTRY_WORDS] },
  { key: 'undercabinet', kind: 'Under cabinet light', group: 'MAIN',
    name: (t) => `Eluma ${inch(nearest(inches(t.text, t.catalog), [12, 24]))} under cabinet light`,
    match: words('UNDER CAB*|UNDERCAB*|UNDER CABINET*|UC') },
  { key: 'tape', kind: 'Tape light (cove)', group: 'MAIN', name: () => 'Lynx tape light (per foot)',
    match: words('TAPE|TAPE LIGHT*|COVE|FLEX|ROPE LIGHT|LED CHANNEL') },
  { key: 'stair', kind: 'Stair light (stairwell)', group: 'MAIN', name: () => 'Eluma 4 ft stair strip with sensor',
    match: words('STAIR*|STAIRWELL*') },
  { key: 'step', kind: 'Step light (outdoor)', group: 'MAIN', name: () => 'Terrain step light',
    match: words('STEP|STEPLIGHT*|STEP LIGHT*') },
  { key: 'bollard', kind: 'Bollard', group: 'MAIN', name: () => 'Terrain bollard', match: words('BOLLARD*') },
  { key: 'wallpack', kind: 'Wall pack', group: 'MAIN', name: () => 'Terrain wall pack', match: words('WALL PACK*|WALLPACK*') },
  { key: 'garage', kind: 'Garage or vapor tight', group: 'MAIN', name: () => 'Eluma garage light',
    match: words('GARAGE|VAPOR*|VPR|PARKING STRUCTURE|PARKING DECK|PARKING GARAGE|GASKETED|CANOPY') },
  { key: 'area', kind: 'Pole or area light (the head)', group: 'MAIN',
    name: (t) => {
      const m = t.text.match(OPTIC_RE);
      const type = m ? ({ III: 3, IV: 4, V: 5 }[m[1]] || m[1] || m[2]) : null;
      return `Eluma area light${type ? `, Type ${type}` : ''}`;
    },
    match: words('POLE|POLES|AREA LIGHT*|AREA STYLE|PARKING LOT|SHOEBOX|COBRA*|ROADWAY|SITE LIGHT*|SITE LUMINAIRE|POST TOP|STREET LIGHT*|STREETLIGHT*') },
  { key: 'troffer', kind: 'Troffer or flat panel', group: 'MAIN',
    name: (t) => { const g = t.text.match(GRID_RE); return `Eluma ${g ? `${g[1]}x${g[2]} ` : ''}flat panel`; },
    match: words('TROFFER*|FLAT PANEL|LED PANEL|2X2|2X4|1X4|2 X 2|2 X 4|1 X 4') },
  { key: 'wrap', kind: 'Wrap or strip light', group: 'MAIN',
    name: (t) => (feet(t.text) >= 8 ? 'Two Eluma 4 ft strip lights' : 'Eluma 4 ft strip light'),
    match: words('WRAP*|STRIP|STRIPS|STRIPLIGHT*|STRIP LIGHT*|SHOP LIGHT|UTILITY LIGHT|CLOSET LIGHT') },
  { key: 'linear', kind: 'Architectural linear', group: 'MAIN',
    name: (t) => { const f = feet(t.text); return `Ascent Summit ${f ? `${f} ft ` : ''}linear`; },
    match: words('LINEAR|SLOT') },
  { key: 'chandelier', kind: 'Chandelier', group: 'DECOR', name: () => 'Dunton House chandelier, closest look', match: words('CHANDELIER*') },
  { key: 'pendant', kind: 'Pendant', group: 'DECOR', pendant: true, match: words('PENDANT*|HANGING|SUSPENDED') },
  { key: 'picture', kind: 'Picture light', group: 'NONE', match: words('PICTURE LIGHT*|ART LIGHT') },
  { key: 'track', kind: 'Track or monopoint', group: 'NONE', match: words('TRACK*|MONOPOINT') },
  { key: 'string', kind: 'String or festoon lights', group: 'NONE', match: words('STRING|STRING LIGHT*|FESTOON|CATENARY|BISTRO') },
  { key: 'landscape', kind: 'Landscape light', group: 'MAIN', name: () => 'Terrain accent light',
    match: words('LANDSCAPE|UPLIGHT*|IN GRADE|INGRADE|PATH LIGHT*|PATHWAY LIGHT*|TREE|FLOOD*|SPOT|SPOTLIGHT*|SPOT LIGHT*|ACCENT') },
  { key: 'porch', kind: 'Outdoor wall or porch light', group: 'MAIN', name: () => 'Eluma outdoor wall lantern',
    match: words('PORCH|PATIO|LANTERN*|EXTERIOR WALL|OUTDOOR WALL|EXTERIOR SCONCE*|OUTDOOR SCONCE*|EXT SCONCE*|BALCONY LIGHT|ENTRY LIGHT|COACH') },
  { key: 'sconce', kind: 'Wall sconce', group: 'MAIN', name: () => 'Eluma cylinder wall sconce', match: SCONCE_WORDS },
  { key: 'cylinder', kind: 'Cylinder', group: 'MAIN',
    name: (t) => `Candela ${inch(inches(t.text, t.catalog))} cylinder`, match: words('CYLINDER*') },
  { key: 'disk', kind: 'Disk or flush mount', group: 'MAIN',
    name: (t) => `Eluma ${inch(nearest(inches(t.text, t.catalog), [5, 6, 7]))} disk`,
    match: words('DISK|DISKS|DISC|DISCS|PUCK*|SURFACE|FLUSH*|EDGE LIT|EDGELIT|CEILING MOUNT*|CEILING LIGHT|DOME') },
  { key: 'wafer', kind: 'Wafer (canless recessed)', group: 'MAIN',
    name: (t) => `Candela ${inch(nearest(inches(t.text, t.catalog), [4, 6]))} slim recessed wafer`,
    match: words('WAFER*|CANLESS|SLIM RECESS*|ULTRA THIN') },
  { key: 'downlight', kind: 'Recessed downlight', group: 'MAIN',
    name: (t) => `Candela ${inch(nearest(inches(t.text, t.catalog), [4, 6]))} recessed downlight`,
    match: words('DOWNLIGHT*|DOWN LIGHT*|RECESS*|CAN|CANS|RETROFIT|HOUSING') },
  { key: 'decorative', kind: 'Decorative or custom', group: 'DECOR', name: () => 'Dunton House, closest look',
    match: words('DECORATIVE|CUSTOM|FEATURE') },
];

const POLE = { key: 'pole', kind: 'Pole (own row since 10-28)', group: 'MAIN',
  name: (t) => { const f = feet(t.text); return `Terrain ${f ? `${f} ft ` : ''}square steel pole`; } };

const tidy = (s) => s.replace(/\s+/g, ' ').trim();

function fanFits(k, text, catalog) {
  if (!k.fan) return true;
  const size = inches(text, catalog);
  return k.fan === 'large' ? size >= 56 : !(size > 55);
}

/** The kind a fixture's words read as, or null. The description is read before the catalog. */
export function sageKindOf({ description, catalog, isPole = false } = {}) {
  const desc = norm(description);
  const cat = norm(String(catalog ?? '').split(/\r?\n/)[0]);
  if (isPole) return { ...POLE, t: { text: `${desc} ${cat}`.trim(), catalog: cat } };
  for (const text of desc ? [desc, `${desc} ${cat}`.trim()] : [cat]) {
    if (!text) continue;
    // A bulb word on a fixture line ("3 lamp vanity") does not make it a bulb.
    let lamp = null;
    for (const k of KINDS) {
      if (k.not && any(k.not, text)) continue;
      const hit = k.all ? k.all.every((list) => any(list, text)) : any(k.match, text);
      if (!hit || !fanFits(k, text, cat)) continue;
      if (k.key === 'lamp') { lamp = lamp || k; continue; }
      if (lamp && k.key === 'decorative') break;
      return { ...k, t: { text, catalog: cat } };
    }
    if (lamp) return { ...lamp, t: { text, catalog: cat } };
  }
  return null;
}

export const isSageMaker = (mfr) => {
  const m = norm(mfr);
  return !!m && SAGE_MAKERS.some((b) => m === b || m.startsWith(`${b} `));
};

/**
 * The Sage alternate for one fixture.
 * Returns { kind, group, name, why } where name is the plain Sage name or null
 * and why says in plain words why there is none.
 */
export function sageAlternate({ description, catalog, mfr, qty, isPole = false } = {}) {
  if (isSageMaker(mfr)) return { kind: null, group: null, name: null, why: 'Already Sage' };
  const k = sageKindOf({ description, catalog, isPole });
  if (!k) return { kind: null, group: null, name: null, why: 'Kind not read' };
  let group = k.group;
  let name = k.name ? tidy(k.name(k.t)) : null;
  if (k.pendant) {
    const inUnit = any(UNIT_WORDS, k.t.text);
    group = inUnit ? 'UNIT' : 'DECOR';
    name = inUnit ? 'Eluma mini pendant' : 'Dunton House pendant, closest look';
  }
  if (group === 'NONE') return { kind: k.kind, group, name: null, why: 'No Sage alternate' };
  if (group === 'DECOR' && !(Number(qty) > DECOR_MIN_QTY)) {
    return { kind: k.kind, group, name: null, why: `Decorative, ${DECOR_MIN_QTY} or fewer` };
  }
  return { kind: k.kind, group, name, why: null };
}

/**
 * Sage alternates for every row of the leveled matrix, keyed by row key.
 * Words come from the spec asked for, then the baseline's line, then any bid.
 * Quantity is the baseline's, else the largest any bid carries.
 */
export function sageColumn(view) {
  const out = {};
  const bids = view?.bids || [];
  const baseId = view?.matrix?.baselineBidId;
  const order = [...bids.filter((b) => b.id === baseId), ...bids.filter((b) => b.id !== baseId)];
  for (const r of view?.matrix?.types || []) {
    const cells = order.map((b) => r.cells[b.id]).filter(Boolean);
    const spec = view.suggestions?.[r.key]?.spec;
    const worded = cells.find((c) => c.description) || cells[0] || {};
    const baseQty = Number(r.cells[baseId]?.qty) > 0 ? Number(r.cells[baseId].qty) : null;
    const qty = baseQty ?? Math.max(0, ...cells.map((c) => Number(c.qty) || 0));
    out[r.key] = sageAlternate({
      description: worded.description || spec?.description || '',
      catalog: spec?.catalog || worded.requestedCatalog || worded.catalog || '',
      mfr: spec?.mfr || worded.requestedMfr || null,
      qty,
      isPole: r.variant === 'P',
    });
  }
  return out;
}
