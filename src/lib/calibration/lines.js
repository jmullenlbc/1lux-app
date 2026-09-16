/**
 * calibration/lines.js — turn one budget run into calibration samples.
 *
 * Pure: no database, no pricing loader. Given the same inputs the engine got
 * (projectData + questionnaire sections), the budget it produced, and the
 * pricing sheet it used, this returns one sample per budget line: the
 * quantity the engine multiplied, the rate it used, the dollars it produced,
 * and — where the project carries a hand-built figure for that same line —
 * the actual. The dashboard's calibration widgets compare the two.
 *
 * Every line names the pricing key its rate lives under so a drift finding
 * can be applied straight back to /admin/pricing. A null pricingKey means
 * the line's rate is not one number (emergency strategy tables, controls by
 * type) and has to be tuned by hand.
 */

import { normalizeAmenityLevel } from '../amenityLevel.js';

const n = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };

export const LINE_LABELS = {
  'units.base':               'Units — base $/SF',
  'corridors.disks':          'Corridors — disks',
  'corridors.stairwells':     'Stairwells (per landing)',
  'boh':                      'Back of House',
  'interior':                 'Interior amenities',
  'garage':                   'Parking garage',
  'exterior.amenities':       'Exterior amenities',
  'exterior.parking':         'Surface parking',
  'exterior.wallpacks':       'Wallpacks',
  'exterior.pathway':         'Pathway lighting',
  'exterior.landscape':       'Landscape',
  'exterior.parkingEntrances':'Parking entrances (manual)',
  'emergency':                'Emergency lighting',
  'exitSigns':                'Exit signs',
  'controls':                 'Controls',
  'total':                    'Total with controls',
};

export const LINE_KEYS = Object.keys(LINE_LABELS);

function parseManualItems(exterior) {
  let items = exterior?.exteriorManualItems;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = null; } }
  return items || {};
}

function levelRate(table, raw, fallbackKey) {
  if (!table) return { key: null, rate: 0 };
  if (raw != null && table[raw] != null) return { key: String(raw), rate: n(table[raw]) };
  const parsed = parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) return { key: null, rate: parsed };
  return { key: fallbackKey, rate: n(table[fallbackKey]) };
}

/**
 * @param {object} args
 * @param {object} args.projectData   the projectData row (+ buildingTypeKey)
 * @param {object} args.sections      responsesToSections() output
 * @param {object} args.budget        calculateBudget() output
 * @param {object} args.pricing       the pricing sheet the budget was built with
 * @returns {Array<object>}           sample rows (no id / projectId / capturedAt)
 */
export function buildSamples({ projectData = {}, sections = {}, budget, pricing }) {
  if (!budget?.sections || !pricing) return [];
  const pd  = projectData || {};
  const s   = budget.sections;
  const ext = sections.exterior || {};
  const am  = sections.amenities || {};
  const em  = sections.emergency || {};

  const grossSf      = n(pd.grossSf);
  const unitsSf      = n(pd.unitsSf) || grossSf;
  const numUnits     = n(pd.numUnits);
  const corridorSf   = n(pd.corridorSf);
  const intSf        = n(pd.interiorAmenitySf);
  const extSf        = n(pd.exteriorAmenitySf);
  const garageSf     = n(pd.garageSf);
  const landings     = n(pd.numEgressStairwells);
  const stalls       = n(pd.numSurfaceParking);
  const bohSf        = s.boh?.capped ? n(s.boh.capped.capSf) : n(pd.bohSf);
  const buildingType = pd.buildingTypeKey || sections.controls?.buildingType || null;
  const solar        = ext.siteDesignLevel === 'solar';
  const siteDesignLevel = solar ? 'solar' : 'conventional';
  const solarMult    = solar ? n(pricing.exterior?.solarMultiplier, 2.3) : 1;
  const manual       = parseManualItems(ext);

  const common = { buildingType, siteDesignLevel };
  const out = [];
  const push = (row) => {
    const quantity = row.quantity != null && row.quantity > 0 ? row.quantity : null;
    const actual   = row.actualAmount != null && row.actualAmount > 0 ? row.actualAmount : null;
    out.push({
      ...common,
      lineKey:      row.lineKey,
      quantity,
      quantityUnit: quantity != null ? row.quantityUnit : null,
      modelAmount:  Math.round(n(row.modelAmount) * 100) / 100,
      actualAmount: actual,
      rateUsed:     row.rateUsed != null && Number.isFinite(row.rateUsed) ? row.rateUsed : null,
      impliedRate:  actual != null && quantity ? Math.round((actual / quantity) * 10000) / 10000 : null,
      pricingKey:   row.pricingKey ?? null,
      note:         row.note ?? null,
    });
  };

  // ── Units ────────────────────────────────────────────────────────────────
  push({ lineKey: 'units.base', quantity: unitsSf, quantityUnit: 'sf',
    modelAmount: s.units?.base?.product, rateUsed: n(pricing.base?.perSf), pricingKey: 'base.perSf' });

  // ── Corridors ────────────────────────────────────────────────────────────
  const diskProduct = n(s.corridors?.disks?.product);
  push({ lineKey: 'corridors.disks', quantity: corridorSf, quantityUnit: 'sf',
    modelAmount: diskProduct,
    // spacing-adjusted on design budgets, so read the rate the engine really used
    rateUsed: corridorSf > 0 ? diskProduct / corridorSf : n(pricing.corridors?.diskPerSf),
    pricingKey: 'corridors.diskPerSf' });
  const stairProduct = n(s.corridors?.stairwells?.product);
  const breezeway    = s.corridors?.stairwells?.breezeway;
  push({ lineKey: 'corridors.stairwells', quantity: landings, quantityUnit: 'landings',
    modelAmount: stairProduct,
    // breezeway walk-ups price each landing at stairwell rate × the breezeway
    // multiplier, so the effective $/landing is the engine's, not the plain rate
    rateUsed: breezeway && landings > 0 ? stairProduct / landings : n(pricing.corridors?.stairwellPerLanding?.product),
    // a breezeway drift is tuned on its style's multiplier, not the shared stairwell rate
    pricingKey: breezeway
      // an average breezeway (no drawings) rides on both multipliers — no single knob to tune
      ? ({ small: 'corridors.breezewaySmallMultiplier', long: 'corridors.breezewayLongMultiplier' }[breezeway.style] ?? null)
      : 'corridors.stairwellPerLanding.product',
    note: breezeway ? breezeway.how : null });

  // ── BOH / interior / garage ──────────────────────────────────────────────
  push({ lineKey: 'boh', quantity: bohSf, quantityUnit: 'sf', modelAmount: s.boh?.product,
    rateUsed: n(pricing.boh?.perSf), pricingKey: 'boh.perSf',
    note: s.boh?.capped ? `BOH capped at ${s.boh.capped.capSf.toLocaleString()} SF (entered ${s.boh.capped.enteredSf.toLocaleString()})` : null });

  const intLevel = levelRate(pricing.interiorAmenities, am.interiorLevel || 'medium', 'medium');
  push({ lineKey: 'interior', quantity: intSf, quantityUnit: 'sf', modelAmount: s.interior?.product,
    rateUsed: intLevel.rate, pricingKey: intLevel.key ? `interiorAmenities.${intLevel.key}` : null });

  push({ lineKey: 'garage', quantity: garageSf, quantityUnit: 'sf', modelAmount: s.garage?.product,
    rateUsed: n(pricing.garage?.perSf), pricingKey: 'garage.perSf' });

  // ── Exterior ─────────────────────────────────────────────────────────────
  // '1'…'5' from a public submission normalizes to a word key, so the sample
  // names a real pricing key instead of drifting to medium.
  const extLevel = levelRate(pricing.exteriorAmenities, normalizeAmenityLevel(ext.amenityLevel), 'medium');
  const night    = ext.amenityHours === 'afterSunset' ? n(pricing.exteriorAmenities?.nighttimeMultiplier, 2) : 1;
  push({ lineKey: 'exterior.amenities', quantity: extSf, quantityUnit: 'sf', modelAmount: s.exterior?.amenities?.product,
    rateUsed: extLevel.rate * night, pricingKey: extLevel.key ? `exteriorAmenities.${extLevel.key}` : null,
    note: night > 1 ? 'after-dark ×2 applied' : null });

  const stallsPerFixture = n(pricing.exterior?.surfaceParking?.stallsPerFixture, 9);
  const parkingFixtures  = stallsPerFixture > 0 ? Math.ceil(stalls / stallsPerFixture) : 0;
  push({ lineKey: 'exterior.parking', quantity: parkingFixtures, quantityUnit: 'fixtures',
    modelAmount: s.exterior?.parking?.product,
    rateUsed: n(pricing.exterior?.surfaceParking?.perFixture, 1325) * solarMult,
    pricingKey: 'exterior.surfaceParking.perFixture',
    note: solar ? `solar ×${solarMult} applied` : null });

  const wp = s.exterior?.wallpacks || {};
  push({ lineKey: 'exterior.wallpacks', quantity: n(wp.qty), quantityUnit: 'fixtures', modelAmount: wp.product,
    rateUsed: n(wp.each, n(pricing.exterior?.wallpacks?.perFixture, 350)), pricingKey: 'exterior.wallpacks.perFixture',
    note: wp.qtyOverridden || wp.priceOverridden ? 'hand override on qty/price' : null });

  // Pathway: the ONE line where a hand-built figure regularly sits next to the
  // model — the manual entry suppresses the model line, so rebuild the model
  // number here to put the two side by side.
  const pw = s.exterior?.pathway || {};
  const pathwayRate = n(pw.rate);
  const pathwayFloor = n(pricing.exterior?.pathway?.minTotal);
  const pathwaySolar = n(pw.solarMultiplier, 1);
  const pathwayModel = numUnits > 0 && pathwayRate > 0 ? Math.max(numUnits * pathwayRate, pathwayFloor) * pathwaySolar : 0;
  const pathwayActual = n(manual.pathwayLighting);
  push({ lineKey: 'exterior.pathway', quantity: numUnits, quantityUnit: 'units',
    modelAmount: pw.suppressedByManual ? pathwayModel : n(pw.product),
    actualAmount: pathwayActual,
    rateUsed: pathwayRate * pathwaySolar,
    pricingKey: pw.buildingType ? `exterior.pathway.dollarsPerUnit.${pw.buildingType}` : null,
    note: pw.suppressedByManual ? 'hand-entered pathway figure on file' : (pw.floorApplied ? 'floor applied' : null) });

  const ls = s.exterior?.landscape || {};
  push({ lineKey: 'exterior.landscape', quantity: n(ls.netLotSf), quantityUnit: 'sf', modelAmount: ls.product,
    rateUsed: n(ls.pct, n(pricing.exterior?.landscape?.pctOfNetLotSf, 0.02)), pricingKey: 'exterior.landscape.pctOfNetLotSf',
    note: ls.capped ? `capped at $${n(pricing.exterior?.landscape?.maxTotal, 3000).toLocaleString()}` : null });

  // Manual-only line: the model has no formula for it yet. Recording the
  // actual is how a formula eventually gets written.
  const entrances = n(manual.parkingEntrances);
  if (entrances > 0) {
    push({ lineKey: 'exterior.parkingEntrances', quantity: null, modelAmount: 0, actualAmount: entrances,
      rateUsed: null, pricingKey: null, note: 'no model line — hand-entered' });
  }

  // ── Emergency / exit signs / controls / total ────────────────────────────
  const emSf = corridorSf + intSf + garageSf;
  push({ lineKey: 'emergency', quantity: emSf, quantityUnit: 'sf', modelAmount: s.emergency?.product,
    rateUsed: emSf > 0 ? n(s.emergency?.product) / emSf : null, pricingKey: null,
    note: `strategy: ${em.strategy || 'frogeyes'}` });

  const exitCutoff = n(pricing.exitSigns?.largeProjectThreshold, 300000);
  const exitRate   = n(pricing.exitSigns?.perSf) * (grossSf > exitCutoff ? 0.5 : 1);
  push({ lineKey: 'exitSigns', quantity: grossSf, quantityUnit: 'sf', modelAmount: s.exitSigns?.product,
    rateUsed: exitRate, pricingKey: 'exitSigns.perSf', note: grossSf > exitCutoff ? 'large-project half rate' : null });

  push({ lineKey: 'controls', quantity: grossSf, quantityUnit: 'sf', modelAmount: budget.controls,
    rateUsed: grossSf > 0 ? n(budget.controls) / grossSf : null, pricingKey: null });

  push({ lineKey: 'total', quantity: grossSf, quantityUnit: 'sf', modelAmount: budget.totalWithControls,
    rateUsed: grossSf > 0 ? n(budget.totalWithControls) / grossSf : null, pricingKey: null });

  return out;
}

/** Walk a dotted key on the pricing sheet (returns undefined when missing). */
export function readPricingKey(pricing, key) {
  return String(key || '').split('.').reduce((o, k) => (o == null ? undefined : o[k]), pricing);
}

/** Set a dotted key on a copy of the pricing sheet. */
export function withPricingKey(pricing, key, value) {
  const parts = String(key || '').split('.').filter(Boolean);
  if (!parts.length) return pricing;
  const copy = JSON.parse(JSON.stringify(pricing || {}));
  let cur = copy;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return copy;
}

/** Pricing keys a calibration finding is allowed to write back. */
export const APPLIABLE_PRICING_KEY_PREFIXES = [
  'base.perSf', 'corridors.diskPerSf', 'corridors.stairwellPerLanding.product', 'boh.perSf',
  'interiorAmenities.', 'exteriorAmenities.', 'garage.perSf',
  'exterior.surfaceParking.perFixture', 'exterior.wallpacks.perFixture',
  'exterior.pathway.dollarsPerUnit.', 'exterior.landscape.pctOfNetLotSf', 'exitSigns.perSf',
];

export function isAppliablePricingKey(key) {
  const k = String(key || '');
  return APPLIABLE_PRICING_KEY_PREFIXES.some(p => p.endsWith('.') ? (k.startsWith(p) && k.length > p.length && !k.slice(p.length).includes('.')) : k === p);
}
