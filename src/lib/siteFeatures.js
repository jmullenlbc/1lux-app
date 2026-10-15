/**
 * Sporadic exterior site features — dog parks, courtyards, playgrounds,
 * tennis and pickleball courts, turf play areas. THE PRICING HALF.
 *
 * Mike, 2026-09-16: these are found by their printed words on the site or
 * landscape plan and each is priced as its own small fixture package —
 * never folded into the exterior amenity SF, the parking area lights or the
 * carports. What each one gets (gross / selling prices, no margin on top):
 *
 *   Dog park          1 area light at the entrance            ($1,400 each)
 *   Courtyard         2 twelve-foot pedestrian poles each (Mike 10-14, count only)
 *   Playground        2 twelve-foot pedestrian poles          ($2,000 each)
 *   Tennis court      4 area lights per court                 ($1,400 each)
 *   Pickleball court  4 area lights per court                 ($1,400 each)
 *
 * Mike 10-14: a dog park now prices as a playground (one "dog park /
 * playground" field) and a pickleball court as a tennis court;
 * normalizeSiteFeatures() folds them before pricing.
 *   Turf play area    1 twelve-foot pedestrian pole per 50 ft ($2,000 each)
 *
 * The kinds, labels, row keys, list clean-up and plain-English descriptions
 * live in `siteFeatureWords.js` and are re-exported here, so every server-side
 * and internal-screen import keeps working. Anything a PUBLIC visitor's
 * browser loads must import `siteFeatureWords.js` directly — this file carries
 * the dollar defaults and must not ship to the public page.
 *
 * PURE. No canvas, no Node, no React — this file is imported by the pricing
 * engine, the quantity takeoff, the site-field proposals, the unit tests and
 * the internal screens. `siteVision.js` (which loads @napi-rs/canvas)
 * re-exports from here rather than the other way round.
 *
 * Nothing in here guesses. A feature that is not on the drawings and not
 * typed in is simply absent, and absent prices at $0.
 */
import { SITE_FEATURE_TYPES, SITE_FEATURE_LABELS, LINEAR_SITE_FEATURES, normalizeSiteFeatures } from './siteFeatureWords.js';

export * from './siteFeatureWords.js';

/**
 * The master-pricing block this math reads. Lives here (and is spread into
 * PRICING.exterior.siteFeatures) so the engine, the admin editor and the
 * tests all agree on the key names.
 */
export const SITE_FEATURE_PRICING_DEFAULTS = {
  areaLight:      1400, // $ each — the same pole-mounted area light a parking lot uses
  pedestrianPole: 2000, // $ each — 12 ft pedestrian pole
  dogPark:         { areaLights: 1 },
  playground:      { pedestrianPoles: 2, packageEach: 3000 }, // Mike 10-14: $3,000 per dog park / playground
  tennisCourt:     { areaLights: 4 },
  pickleballCourt: { areaLights: 4 },
  courtyard:       { pedestrianPoles: 2 }, // Mike 10-14: a count, 2 poles each, no length
  turfPlay:        { ftPerPole: 50 },
};

const pos = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/**
 * Fixtures and dollars for ONE feature.
 *
 * @param {{type:string,count?:number,lengthFt?:number,label?:string}} feature
 * @param {object} [rates]  PRICING.exterior.siteFeatures (defaults fill any gap)
 * @returns {null | {type,label,count,lengthFt,fixtures,fixtureKind,each,product,how}}
 *   fixtureKind is 'areaLight' or 'pedestrianPole'. Null for an unknown type
 *   or a feature with nothing to price (a courtyard with no length).
 */
export function siteFeatureFixtures(feature, rates = null) {
  const type = String(feature?.type ?? '');
  if (!SITE_FEATURE_TYPES.includes(type)) return null;
  const R = rates && typeof rates === 'object' ? rates : {};
  const D = SITE_FEATURE_PRICING_DEFAULTS;
  const areaEach = pos(R.areaLight, D.areaLight);
  const poleEach = pos(R.pedestrianPole, D.pedestrianPole);
  const count = Math.max(0, Math.round(Number(feature?.count) || 0));
  const lengthFt = LINEAR_SITE_FEATURES.has(type) ? Math.max(0, Math.round(Number(feature?.lengthFt) || 0)) : null;
  const label = SITE_FEATURE_LABELS[type];

  let fixtures = 0, fixtureKind, each, how;
  switch (type) {
    case 'dogPark': {
      const per = pos(R.dogPark?.areaLights, D.dogPark.areaLights);
      fixtures = count * per; fixtureKind = 'areaLight'; each = areaEach;
      how = `${count} dog park${count === 1 ? '' : 's'} × ${per} area light${per === 1 ? '' : 's'} at the entrance.`;
      break;
    }
    case 'playground': {
      const per = pos(R.playground?.pedestrianPoles, D.playground.pedestrianPoles);
      // Priced as one package (Mike 10-14: $3,000, a better average than 2 poles
      // at the pole price); the pole count stays for the fixture count.
      const pkg = pos(R.playground?.packageEach, D.playground.packageEach);
      fixtures = count * per; fixtureKind = 'pedestrianPole'; each = pkg / per;
      how = `${count} dog park / playground${count === 1 ? '' : 's'} × ${usd(pkg)} package (${per} 12 ft pedestrian pole${per === 1 ? '' : 's'} each).`;
      return { type, label, count, lengthFt, fixtures, fixtureKind, each, packageEach: pkg, product: count * pkg, how };
    }
    case 'tennisCourt':
    case 'pickleballCourt': {
      const per = pos(R[type]?.areaLights, D[type].areaLights);
      fixtures = count * per; fixtureKind = 'areaLight'; each = areaEach;
      how = `${count} ${label.toLowerCase()}${count === 1 ? '' : 's'} × ${per} area lights per court.`;
      break;
    }
    case 'courtyard': {
      // Mike 10-14: nobody knows a courtyard's length; count them, 2 poles each.
      const per = pos(R.courtyard?.pedestrianPoles, D.courtyard.pedestrianPoles);
      fixtures = count * per; fixtureKind = 'pedestrianPole'; each = poleEach;
      how = `${count} courtyard${count === 1 ? '' : 's'} × ${per} 12 ft pedestrian pole${per === 1 ? '' : 's'} each.`;
      break;
    }
    case 'turfPlay': {
      const ftPer = pos(R[type]?.ftPerPole, D[type].ftPerPole);
      fixtures = lengthFt > 0 ? Math.ceil(lengthFt / ftPer) : 0;
      fixtureKind = 'pedestrianPole'; each = poleEach;
      how = lengthFt > 0
        ? `${lengthFt.toLocaleString()} ft ÷ ${ftPer} ft per 12 ft pedestrian pole.`
        : `${label} found but no length known — enter the length in feet to price it.`;
      break;
    }
    default:
      return null;
  }
  return { type, label, count, lengthFt, fixtures, fixtureKind, each, product: fixtures * each, how };
}

/**
 * Price a whole list of features. Missing / malformed entries are skipped;
 * one row per type in display order.
 *
 * @returns {{ product:number, items:Array, areaLights:number, pedestrianPoles:number }}
 */
export function priceSiteFeatures(list, rates = null) {
  const items = [];
  let product = 0, areaLights = 0, pedestrianPoles = 0;
  for (const f of normalizeSiteFeatures(list)) {
    const r = siteFeatureFixtures(f, rates);
    if (!r) continue;
    items.push(r);
    product += r.product;
    if (r.fixtureKind === 'areaLight') areaLights += r.fixtures;
    else pedestrianPoles += r.fixtures;
  }
  return { product, items, areaLights, pedestrianPoles };
}

const usd = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

/**
 * The dollar side of one priced feature, spelled out for the Exterior
 * breakdown (Mike 2026-09-16: "a breakdown of these added costs too so it's
 * transparent"). Takes an item from `priceSiteFeatures()` / `siteFeatureFixtures()`:
 *
 *   "1 area light × $1,400 = $1,400"
 *   "3 pedestrian poles (12 ft) × $2,000 = $6,000"
 *   "$0 until a length is entered."   (a linear feature with no length)
 *
 * Internal screens only — it names the price of one fixture.
 */
export function siteFeatureCostLine(item) {
  const fixtures = Math.max(0, Math.round(Number(item?.fixtures) || 0));
  if (!fixtures) return '$0 until a length is entered.';
  if (item?.packageEach) return `${item.count} × ${usd(item.packageEach)} package (${fixtures} pedestrian pole${fixtures === 1 ? '' : 's'}) = ${usd(item.product)}`;
  const kind = item?.fixtureKind === 'areaLight'
    ? `area light${fixtures === 1 ? '' : 's'}`
    : `pedestrian pole${fixtures === 1 ? '' : 's'} (12 ft)`;
  return `${fixtures} ${kind} × ${usd(item?.each)} = ${usd(item?.product)}`;
}
