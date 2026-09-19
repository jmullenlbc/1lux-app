/**
 * Stair landings — the one count the budget needs that drawings almost never
 * print. The engine prices $200 per LANDING (Project Data's
 * `numEgressStairwells` field holds landings, not shafts), so every path that
 * fills that field — the public intake takeoff, the internal site-plan read,
 * and a human typing it — has to agree on the arithmetic. This is where it
 * lives, once.
 *
 * Mike's ladder (2026-09-05), in order:
 *   1. Drawings say it: stories + exit-stair count (stated or counted) →
 *      landings = stairs × (2 × stories − 1). A switchback stair serving N
 *      levels has N floor landings plus N−1 mid-level landings between floors
 *      ("always make sure we add in that middle landing between levels"),
 *      every one of them lit.
 *   2. Drawings don't say it: estimate from the building code. Residential
 *      (R-2) over one story needs at least two exit stairs per building
 *      (IBC 1006.3), and a long floor plate needs more because no point may
 *      be farther than the allowed travel distance (250 ft sprinklered) from
 *      an exit — so one stair per so-many SF of floor plate, never fewer
 *      than two. The per-stair plate size depends on the building type
 *      (calibrated 2026-09-05 against six projects on file): a corridor
 *      building's enclosed stairs each cover a big stretch of plate
 *      (~15,000 SF), a garden/breezeway walk-up's open stairs each serve
 *      only the units around them (~5,000 SF), and townhouses have private
 *      in-unit stairs — no shared landings at all. Stories, when not
 *      written, are gross SF ÷ footprint.
 *   3. Nothing to go on: return null so the field is asked for. The manual
 *      entry on the project page is the last resort, never the first.
 *
 * Then +10% on any derived or estimated count ("let's add 10% to landings")
 * — never on a count a human typed, because they were told to add it.
 *
 * The four numbers (10%, two stairs, 15,000 SF corridor, 5,000 SF breezeway)
 * live on the master pricing sheet (PRICING.estimation, editable at
 * /admin/pricing), not here.
 *
 * Pure: no IO, no model, no clock.
 *
 * @see src/lib/intake/quantities.js — the public takeoff's landings row
 * @see src/lib/siteFields.js        — the internal project page's proposal
 * @see scripts/tests/stairLandings.test.mjs
 */
import { PRICING } from './pricing.js';

function pos(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A count that may legitimately be zero (a stated "0 exit stairs"). */
function count(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function fmt(n) { return Number(n).toLocaleString('en-US'); }

/** Landings on one switchback stair serving `stories` levels: 2N − 1. */
export function landingsPerStair(stories) {
  const s = pos(stories);
  return s ? Math.max(0, 2 * Math.round(s) - 1) : 0;
}

/**
 * The tunable factors, read from the live pricing sheet with the static
 * defaults as the floor — same pattern as unitsToGross in quantities.js.
 */
export function landingFactors(pricing = null) {
  const live = pricing?.estimation || {};
  const def  = PRICING.estimation;
  const num  = (k, min) => {
    const n = Number(live[k]);
    return Number.isFinite(n) && n >= min ? n : def[k];
  };
  return {
    contingency:              num('landingsContingency', 0),
    minStairs:                Math.max(1, Math.round(num('exitStairsMinPerBuilding', 1))),
    plateSfPerStair:          num('floorPlateSfPerExitStair', 1000),
    breezewayPlateSfPerStair: num('breezewayPlateSfPerExitStair', 500),
    breezewayUnitsPerStair:   num('breezewayUnitsPerStair', 1),
  };
}

/** Building types whose stairs are open breezeway walk-ups, each serving only
 *  the units around it — so a plate holds far more of them than a corridor
 *  building's enclosed shafts. */
export const BREEZEWAY_TYPES = new Set(['garden', 'stackedFlats', 'gurban']);

/** True when this building type's shared stairs are open breezeway stairs. */
export function isBreezewayType(buildingTypeKey) {
  return typeof buildingTypeKey === 'string' && BREEZEWAY_TYPES.has(buildingTypeKey);
}

/**
 * What kind of stairs the building has — asked on the Corridors screen as one
 * dropdown (Mike 2026-09-14: "ask corridors + stairwells or breezeways
 * (Interior or Exterior) as a single select dropdown"). Unanswered, it follows
 * the building type: garden / stacked flats / gurban are breezeways.
 */
export const STAIR_TYPES = Object.freeze({
  interior:  { label: 'Interior corridors + stairwells' },
  breezeway: { label: 'Exterior breezeways' },
});

/** 'interior' | 'breezeway' — an explicit answer wins, else the building type. */
export function stairTypeFor(answer, buildingTypeKey) {
  if (answer === 'interior' || answer === 'breezeway') return answer;
  return isBreezewayType(buildingTypeKey) ? 'breezeway' : 'interior';
}

/**
 * Breezeway styles, Mike 2026-09-14. Small vs long can only be told apart on
 * the drawings ("No one will know what that means"), so it is asked only when
 * the project has drawings. Unanswered = 'average': halfway between the two
 * multipliers (1.175 × $200 = $235).
 */
export const BREEZEWAY_STYLES = Object.freeze({
  average: { key: null, label: 'Breezeway (average)', like: null,
    fixtures: 'priced halfway between a small and a long breezeway until the drawings show which' },
  small: { key: 'breezewaySmallMultiplier', label: 'Small breezeway', like: 'Lowell + I76',
    fixtures: 'an EM disk at the ground floor, a wall pack up each flight, a 7" disk + frogeye at the landings' },
  long:  { key: 'breezewayLongMultiplier',  label: 'Long breezeway',  like: 'Lone Tree Ranch',
    fixtures: 'wall packs over long stairs and 4 disks along the open corridor above, 2 with EM batteries' },
});

/** 'small' or 'long' when someone picked it off the drawings; anything else is 'average'. */
export function breezewayStyle(v) {
  return v === 'small' || v === 'long' ? v : 'average';
}

/** The multiplier for a style off the live sheet (static defaults as the floor). */
export function breezewayMultiplier(style, pricing = null) {
  const pick = k => {
    const v = pricing?.corridors?.[k];
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && v !== null && v !== '' ? n : PRICING.corridors[k];
  };
  const s = breezewayStyle(style);
  if (s !== 'average') return pick(BREEZEWAY_STYLES[s].key);
  return Math.round(((pick('breezewaySmallMultiplier') + pick('breezewayLongMultiplier')) / 2) * 10000) / 10000;
}

/**
 * What breezeway stairs cost to light. Each landing on a garden / stacked-flat
 * / gurban walk-up prices at the stairwell rate × the breezeway style's
 * multiplier, both on the master pricing sheet. Mike 2026-09-14: small
 * breezeways (like Lowell + I76) run "a 10-15% increase", long ones (like Lone
 * Tree Ranch) "a 20-25% increase" — 1.125 × $200 = $225, 1.225 × $200 = $245.
 * Without drawings nobody can tell which, so it prices the average, 1.175 =
 * $235. (This replaced the flat 2.2× of 2026-09-12.)
 *
 * Landings stay the number the budget stores (2N−1 per stair, contingency
 * included). The stair count (landings ÷ (2N−1), never below one) is only for
 * the label — it does not change the price.
 *
 * @param {object} input
 *   landings        — the stored landing count (Project Data numEgressStairwells)
 *   stories         — levels each stair serves; falls back to the type default
 *   buildingTypeKey — engine building type
 *   stairType       — 'interior' | 'breezeway' | unset (corridors.stairType);
 *                     an answer beats the building type, unset follows it
 *   style           — 'small' | 'long' | anything else = average
 *                     (corridors.breezewayStyle, asked only with drawings)
 * @param {object|null} pricing  loadPricing() output, or null for static defaults
 * @returns {null|{ stairs, stories, storiesDefaulted, landings, style,
 *   perLanding, multiplier, ratePerLanding, product, how }}
 *   null for interior stairs or when there are no landings to price.
 */
export function breezewayStairPackage(input, pricing = null) {
  const typeKey = typeof input?.buildingTypeKey === 'string' ? input.buildingTypeKey : null;
  if (stairTypeFor(input?.stairType, typeKey) !== 'breezeway') return null;
  const landings = pos(input?.landings);
  if (!landings) return null;

  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && v !== null && v !== '' ? n : fallback;
  };
  const perLanding = num(pricing?.corridors?.stairwellPerLanding?.product, PRICING.corridors.stairwellPerLanding.product);
  const style = breezewayStyle(input?.style);
  const multiplier = breezewayMultiplier(style, pricing);
  const ratePerLanding = Math.round(perLanding * multiplier * 100) / 100;
  const product = Math.round(landings * ratePerLanding * 100) / 100;

  const def  = PRICING.breezewayStair;
  const live = pricing?.breezewayStair || {};
  const typeDefault = pos(live.storiesDefault?.[typeKey]) ?? pos(def.storiesDefault?.[typeKey]) ?? 3;
  const stories = Math.max(1, Math.round(pos(input?.stories) ?? typeDefault));
  const storiesDefaulted = pos(input?.stories) == null;
  const stairs = Math.max(1, Math.round(landings / landingsPerStair(stories)));

  const how =
    `${fmt(landings)} landings × $${fmt(perLanding)} × ${multiplier} = $${fmt(ratePerLanding)} a landing ` +
    `— ${BREEZEWAY_STYLES[style].label.toLowerCase()}` +
    (BREEZEWAY_STYLES[style].like ? ` (like ${BREEZEWAY_STYLES[style].like})` : '') + ': ' +
    `${BREEZEWAY_STYLES[style].fixtures}. ` +
    `About ${fmt(stairs)} stair${stairs === 1 ? '' : 's'} of ${stories} levels` +
    (storiesDefaulted ? ` (no story count on file — ${stories} levels assumed for a ${typeKey} walk-up)` : '') + '.';

  return { stairs, stories, storiesDefaulted, landings, style, perLanding, multiplier, ratePerLanding, product, how };
}

/** Building types whose stairs are PRIVATE, inside each unit — no shared
 *  egress stairs, no shared landings to light. */
const PRIVATE_STAIR_TYPES = new Set(['townHouses', 'singleFamily']);

/**
 * Build the landings count from whatever is known.
 *
 * @param {object} input
 *   stories         — story count (stated / counted / typed), or null
 *   stairs          — exit-stair (shaft) count for the WHOLE PROJECT, or null;
 *                     0 is a real answer
 *   stairsPerBuilding — exit stairs in ONE building (what a floor plan or a
 *                     code summary shows — Mike 2026-09-16: "buildings ×
 *                     floors × 2"), used when `stairs` is null and multiplied
 *                     by `buildings`; 0 is a real answer
 *   buildings       — residential building count, or null (treated as 1)
 *   footprintSf     — building footprint, for floor-plate size and story estimate
 *   grossSf         — total building gross SF, for the story estimate
 *   buildingTypeKey — engine building type ('garden', 'wrap', …), or null;
 *                     only matters when the stair count itself is estimated
 *                     (breezeway walk-ups pack more stairs per plate, and
 *                     townhouse stairs are private — zero shared landings).
 *                     Null falls back to the corridor factor.
 * @param {object|null} pricing  loadPricing() output, or null for static defaults
 * @returns {null|{
 *   landings, base, stories, stairs, buildings, stairsPerBuilding, plateSf,
 *   storiesEstimated, stairsEstimated, estimated, contingency, how, flag }}
 *   null when no count can be built (stories unknown and unestimable).
 */
export function estimateStairLandings(input, pricing = null) {
  const f = landingFactors(pricing);
  const footprint = pos(input?.footprintSf);
  const gross     = pos(input?.grossSf);

  let stories = pos(input?.stories);
  let storiesEstimated = false;
  if (stories == null && footprint && gross && gross >= footprint) {
    stories = Math.max(1, Math.round(gross / footprint));
    storiesEstimated = true;
  }
  if (stories == null) return null;
  stories = Math.round(stories);

  const typeKey = typeof input?.buildingTypeKey === 'string' ? input.buildingTypeKey : null;
  const breezeway = typeKey != null && BREEZEWAY_TYPES.has(typeKey);
  const privateStairs = typeKey != null && PRIVATE_STAIR_TYPES.has(typeKey);

  const sfPerStair = breezeway ? f.breezewayPlateSfPerStair : f.plateSfPerStair;

  let stairs = count(input?.stairs);
  let stairsEstimated = false;
  let buildings = null, perBuilding = null, plate = null, unitsBased = false;
  // A per-building stair count (read off one building's plan) × the number
  // of buildings. Lone Tree Ranch, 2026-09-16: 3 stairs on the typical plan
  // were priced as 3 for the whole site — 4 buildings × 3 = 12 stairs, and
  // 12 × 7 landings = 84, not 21.
  let perBuildingGiven = false;
  const stairsPerBuildingIn = count(input?.stairsPerBuilding);
  if (stairs == null && stairsPerBuildingIn != null) {
    buildings = Math.max(1, Math.round(pos(input?.buildings) ?? 1));
    perBuilding = stairsPerBuildingIn;
    stairs = buildings * perBuilding;
    perBuildingGiven = true;
  }
  if (stairs == null) {
    stairsEstimated = true;
    buildings = Math.max(1, Math.round(pos(input?.buildings) ?? 1));
    if (privateStairs) {
      // Townhouse / single-family stairs live inside each unit — nothing
      // shared, nothing to light at $200 a landing.
      perBuilding = 0;
    } else if (stories <= 1) {
      // A single-story building has no interior exit stair to light.
      perBuilding = 0;
    } else {
      plate = footprint ? footprint / buildings : null;
      perBuilding = plate
        ? Math.max(f.minStairs, Math.round(plate / sfPerStair))
        : f.minStairs;
    }
    stairs = buildings * perBuilding;
    // Breezeway walk-up with no footprint (a typed-in budget): the code
    // minimum of 2 stairs badly undercounts a campus of open stairs, so count
    // them off the units — each open stair serves only the units around it.
    // Real gardens on file ran ~12–20 units a stair (Firestone, Fulshear,
    // Easton, Eastchase: 81–144 landings).
    const units = pos(input?.units);
    if (breezeway && !plate && units && stories > 1) {
      const byUnits = Math.ceil(units / f.breezewayUnitsPerStair);
      if (byUnits > stairs) { stairs = byUnits; perBuilding = null; unitsBased = true; }
    }
  }

  const per  = stories >= 1 ? 2 * stories - 1 : 0;
  const base = stairs * per;
  const landings = Math.round(base * (1 + f.contingency));
  const pct = Math.round(f.contingency * 100);
  const estimated = storiesEstimated || stairsEstimated;

  const parts = [];
  if (storiesEstimated) {
    parts.push(`No story count was found, so stories ≈ gross ${fmt(gross)} SF ÷ footprint ${fmt(footprint)} SF = ${fmt(stories)}.`);
  }
  if (perBuildingGiven) {
    parts.push(`${fmt(buildings)} building${buildings === 1 ? '' : 's'} × ${fmt(perBuilding)} exit stair${perBuilding === 1 ? '' : 's'} each = ${fmt(stairs)} stairs.`);
  }
  if (stairsEstimated) {
    if (privateStairs) {
      parts.push('Townhouse-style stairs are private, inside each unit — no shared egress stairs, so no shared landings to light.');
    } else if (stories <= 1) {
      parts.push('No exit-stair count was found and the building is single-story, so no interior stairs are assumed.');
    } else if (unitsBased) {
      parts.push(`No exit-stair count or footprint was found, so the open breezeway stairs were counted off the units: ${fmt(pos(input?.units))} units ÷ ${fmt(f.breezewayUnitsPerStair)} units per stair ≈ ${fmt(stairs)} stairs (each open stair serves only the units around it).`);
    } else if (plate) {
      parts.push(`No exit-stair count was found, so the building code minimum was used: ${fmt(buildings)} building${buildings === 1 ? '' : 's'} × ${fmt(perBuilding)} exit stairs (a ~${fmt(Math.round(plate))} SF floor plate needs about one ${breezeway ? 'breezeway stair per ' + fmt(sfPerStair) + ' SF — open walk-up stairs each serve only the units around them' : 'stair per ' + fmt(sfPerStair) + ' SF for travel distance'}, never fewer than ${f.minStairs}) = ${fmt(stairs)} stairs.`);
    } else {
      parts.push(`No exit-stair count or footprint was found, so the building code minimum was used: ${fmt(buildings)} building${buildings === 1 ? '' : 's'} × ${f.minStairs} exit stairs = ${fmt(stairs)} stairs.`);
    }
  }
  parts.push(
    `${fmt(stairs)} stair${stairs === 1 ? '' : 's'} × (2 × ${fmt(stories)} stories − 1) = ${fmt(base)} landings` +
    (pct > 0 ? `, + ${pct}% = ${fmt(landings)}` : '') +
    ' — a switchback stair serving N levels has 2N−1 landings (the mid-level landing between floors included), every one of them lit.'
  );

  const flag = estimated
    ? 'ESTIMATED from building-code minimums, not read off the drawings — confirm the story and exit-stair counts on the plans, or enter the landing count.'
    : null;

  return {
    landings, base, stories, stairs, buildings, stairsPerBuilding: perBuilding, plateSf: plate,
    perBuildingGiven,
    unitsBased, unitsPerStair: unitsBased ? f.breezewayUnitsPerStair : null,
    storiesEstimated, stairsEstimated, estimated, privateStairs, contingency: f.contingency,
    how: parts.join(' '), flag,
  };
}
