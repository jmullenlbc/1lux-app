/**
 * Stair landings — the one count the budget needs that drawings almost never
 * print. The engine prices $175 per LANDING (Project Data's
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
 * What one breezeway stair costs to light — the Lowell + I76 package (see
 * PRICING.breezewayStair): per stair serving N levels, N landing disks (a
 * regular disk — Mike 2026-09-05: "Decorative landing light we don't do in a
 * conceptual budget"), 2N+1 wall packs with battery (stair + egress), N
 * frogeyes, N−1 vestibule disks with battery. The ground-level egress wall
 * pack lives in the exterior wallpacks line and is not counted here.
 *
 * Landings stay the number the budget stores (2N−1 per stair, contingency
 * included), so the stair count is landings ÷ (2N−1), never below one.
 *
 * @param {object} input
 *   landings        — the stored landing count (Project Data numEgressStairwells)
 *   stories         — levels each stair serves; falls back to the type default
 *   buildingTypeKey — engine building type
 * @param {object|null} pricing  loadPricing() output, or null for static defaults
 * @returns {null|{ stairs, stories, landings, perStair: {...}, counts: {...},
 *   rates: {...}, perStairProduct, product, how }}
 *   null for non-breezeway types or when there are no landings to price.
 */
export function breezewayStairPackage(input, pricing = null) {
  const typeKey = typeof input?.buildingTypeKey === 'string' ? input.buildingTypeKey : null;
  if (!isBreezewayType(typeKey)) return null;
  const landings = pos(input?.landings);
  if (!landings) return null;

  const def  = PRICING.breezewayStair;
  const live = pricing?.breezewayStair || {};
  const rate = (k) => {
    const n = Number(live[k]);
    return Number.isFinite(n) && n >= 0 ? n : def[k];
  };
  const rates = {
    landingLight:        rate('landingLight'),
    wallpackWithBattery: rate('wallpackWithBattery'),
    frogeye:             rate('frogeye'),
    vestibuleDisk:       rate('vestibuleDisk'),
  };

  const typeDefault = pos(live.storiesDefault?.[typeKey]) ?? pos(def.storiesDefault?.[typeKey]) ?? 3;
  const stories = Math.max(1, Math.round(pos(input?.stories) ?? typeDefault));
  const storiesDefaulted = pos(input?.stories) == null;

  const per    = landingsPerStair(stories);
  const stairs = Math.max(1, Math.round(landings / per));

  const perStair = {
    landingLights:  stories,
    wallpacks:      2 * stories + 1,
    frogeyes:       stories,
    vestibuleDisks: Math.max(0, stories - 1),
  };
  const counts = {
    landingLights:  stairs * perStair.landingLights,
    wallpacks:      stairs * perStair.wallpacks,
    frogeyes:       stairs * perStair.frogeyes,
    vestibuleDisks: stairs * perStair.vestibuleDisks,
  };
  const perStairProduct =
    perStair.landingLights  * rates.landingLight +
    perStair.wallpacks      * rates.wallpackWithBattery +
    perStair.frogeyes       * rates.frogeye +
    perStair.vestibuleDisks * rates.vestibuleDisk;
  const product = stairs * perStairProduct;

  const how =
    `${fmt(landings)} landings ÷ (2 × ${stories} levels − 1) ≈ ${fmt(stairs)} breezeway stair${stairs === 1 ? '' : 's'}` +
    (storiesDefaulted ? ` (no story count on file — ${stories} levels assumed for a ${typeKey} walk-up)` : '') +
    `. Each stair: ${perStair.landingLights} landing disks, ${perStair.wallpacks} wall packs w/ battery on the stair and egress, ` +
    `${perStair.frogeyes} emergency frogeyes, ${perStair.vestibuleDisks} vestibule disks w/ battery = $${fmt(perStairProduct)}/stair. ` +
    'The ground-floor egress wall pack is in the exterior wallpacks line.';

  return { stairs, stories, storiesDefaulted, landings, perStair, counts, rates, perStairProduct, product, how };
}

/** Building types whose stairs are PRIVATE, inside each unit — no shared
 *  egress stairs, no shared landings to light. */
const PRIVATE_STAIR_TYPES = new Set(['townHouses', 'singleFamily']);

/**
 * Build the landings count from whatever is known.
 *
 * @param {object} input
 *   stories         — story count (stated / counted / typed), or null
 *   stairs          — exit-stair (shaft) count, or null; 0 is a real answer
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
  let buildings = null, perBuilding = null, plate = null;
  if (stairs == null) {
    stairsEstimated = true;
    buildings = Math.max(1, Math.round(pos(input?.buildings) ?? 1));
    if (privateStairs) {
      // Townhouse / single-family stairs live inside each unit — nothing
      // shared, nothing to light at $175 a landing.
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
  if (stairsEstimated) {
    if (privateStairs) {
      parts.push('Townhouse-style stairs are private, inside each unit — no shared egress stairs, so no shared landings to light.');
    } else if (stories <= 1) {
      parts.push('No exit-stair count was found and the building is single-story, so no interior stairs are assumed.');
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
    storiesEstimated, stairsEstimated, estimated, privateStairs, contingency: f.contingency,
    how: parts.join(' '), flag,
  };
}
