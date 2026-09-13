// Extension is explicit so plain Node (`node --test`) can load this file
// directly, the same way Next's bundler does. Without it the test runner cannot
// resolve './pricing'.
import { PRICING as STATIC_PRICING } from './pricing.js';
import { breezewayStairPackage } from './stairLandings.js';
import { emergencyStrategyCost } from './emergencyCost.js';

// Safely convert any value to a finite number
function n(val, fallback = 0) {
  const num = Number(val);
  return (isFinite(num) && !isNaN(num)) ? num : fallback;
}

/**
 * Fan room multipliers — fractional values are intentional.
 * Accounts for unit mix (not every unit has every room type).
 * Total fan count = pd.numFans if set, else ROUND(numUnits × multiplier)
 */
const FAN_ROOMS = {
  none:                          0,
  masterOnly:                    1,
  livingRoomOnly:                1,
  masterAndLiving:               2,
  masterAndSecondary:            1.5,
  masterSecondaryLiving:         2.5,
  masterSecondaryTertiary:       2.5,
  masterSecondaryTertiaryLiving: 2.75,
};

/**
 * Per-project manual price override.
 *
 * Master pricing is the default. If someone types a number into the override box
 * on a question, THAT number becomes the price the engine multiplies by the count.
 * What you type is what you get — no credits, no adjustments applied on top of it.
 * That matters most for vanities and fans, where master pricing carries a hidden
 * credit ($45 bath bar, $35 disk); an override skips that math entirely, because
 * a person typing "$200 per vanity" means $200, not $200 minus something.
 *
 * Returns the override price, or null meaning "no override — use master pricing".
 *
 * Blank is not an override. Neither is the string 'auto', which is what the form
 * writes when someone CLEARS the box. It has to write something non-blank: the
 * responses store deliberately refuses to overwrite a real value with a blank one
 * (that rule exists because stale wizard sections were silently wiping answers),
 * so a cleared field that sent '' would be skipped and the old override would
 * survive forever. 'auto' is a real write that parses to no-override.
 */
export function priceOverride(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '' || s.toLowerCase() === 'auto') return null;
  const num = Number(s);
  if (!isFinite(num) || isNaN(num) || num < 0) return null;
  return num;
}

/**
 * A project's frozen pricing snapshot only knows the lines that existed the day
 * the project was created. Lines added since (wallpacks, pathway, landscape
 * caps, the solar multipliers…) are simply absent from it — and absent read as
 * $0, which is how every April project came to show $0 wallpacks and $0
 * pathway on its live page. Snapshot values still win for every key they carry;
 * missing keys fall through to the master sheet — the same rule loadPricing()
 * applies to the saved DB record.
 */
export function fillPricingDefaults(defaults, override) {
  if (!override || typeof override !== 'object') return defaults;
  const out = { ...defaults };
  for (const [k, v] of Object.entries(override)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k])) {
      out[k] = fillPricingDefaults(defaults[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function calculateBudget(projectData, responses = {}, pricingOverride = null) {
  const PRICING = pricingOverride ? fillPricingDefaults(STATIC_PRICING, pricingOverride) : STATIC_PRICING;
  const pd = projectData || {};
  const r  = responses   || {};

  const units          = r.units          || {};
  const corridors      = r.corridors      || {};
  const amenities      = r.amenities      || {};
  const exterior       = r.exterior       || {};
  const emergency      = r.emergency      || {};
  const controls       = r.controls       || {};
  const projectDataR   = r['project-data'] || {};

  // Sales tax: stored on project data as decimal (e.g. 0.0915 for 9.15%)
  // Also falls back to questionnaire responses for legacy data
  const salesTaxPct = n(pd.salesTaxPct) || n(projectDataR.salesTax) || 0;

  // One building type for the whole budget: the project's own, else whatever
  // the questionnaire said, else a mid-rise. Drives the stair package, the
  // exterior wallpack count and the controls cap.
  const buildingTypeKey = pd.buildingTypeKey || controls.buildingType || controls.projectType || 'midRise';

  // ─── SAFE PROJECT DATA NUMBERS ────────────────────────────────────────────
  const grossSf        = n(pd.grossSf);
  const unitsSf        = n(pd.unitsSf) || grossSf;
  const numUnits       = n(pd.numUnits);
  const numBalconies   = n(pd.numBalconies);
  const numVanities    = n(pd.numVanities) || n(pd.numBathrooms);
  const corridorSf     = n(pd.corridorSf);
  const intAmenitySf   = n(pd.interiorAmenitySf);
  const extAmenitySf   = n(pd.exteriorAmenitySf);
  const garageSf       = n(pd.garageSf);
  // BOH is hard-capped at a % of gross SF (Mike: "BOH should never be more
  // than 5% of the Gross SF") — protects against the remainder-derived BOH
  // swallowing corridors/walls when corridor SF is unknown.
  const bohSfEntered   = n(pd.bohSf);
  const bohCapSf       = grossSf > 0 ? Math.round(grossSf * n(PRICING.boh.maxPctOfGross, 0.05)) : null;
  const bohSf          = bohCapSf != null ? Math.min(bohSfEntered, bohCapSf) : bohSfEntered;
  const stairwells     = n(pd.numEgressStairwells);
  const surfaceParking = n(pd.numSurfaceParking);
  const numCarports    = n(pd.numCarports);
  const numGarages     = n(pd.numGarages);
  const lotSf          = n(pd.lotSf);
  const footprintSf    = n(pd.buildingFootprintSf);
  // Accent qty: prefer the value entered in the Corridors section, else Project Data
  const numAccents     = n(r.corridors?.accentQty) > 0 ? n(r.corridors.accentQty) : n(pd.numAccentDownlights);

  // ─── RESIDENTIAL UNITS ────────────────────────────────────────────────────
  // Base rate applies to gross SF in design mode.
  // The $0.38/SF encompasses the typical design package: 7" flat edge-lit disks,
  // decorative unit entry, 4 dimmers/unit. Deviations from defaults are adders/credits.
  const baseProduct = (unitsSf || grossSf) * PRICING.base.perSf;

  // Undercabinet
  const ucPricing           = PRICING.undercabinet[units.undercabinet || 'none'] || PRICING.undercabinet.none;
  const undercabinetProduct = n(ucPricing.product) * numUnits;

  // Kitchen pendants
  // An override only applies to a selected upgrade. If the answer is "None" the
  // line is zero no matter what price is sitting in the override box — otherwise
  // a stale override would quietly charge for something the project said no to.
  const pendantPricing  = PRICING.kitchenPendants[units.kitchenPendants || 'none'] || PRICING.kitchenPendants.none;
  const pendantsChosen  = (units.kitchenPendants || 'none') !== 'none';
  const pendantsUnit    = pendantsChosen
    ? (priceOverride(units.kitchenPendantsPrice) ?? n(pendantPricing.product))
    : 0;
  const pendantsProduct = pendantsUnit * numUnits;

  // Ceiling fans: use explicit pd.numFans when set (from project data field),
  // otherwise fall back to ROUND(numUnits × room multiplier)
  const fanMult  = FAN_ROOMS[units.fans || 'none'] ?? 0;
  const fanCount = n(pd.numFans) > 0 ? n(pd.numFans) : Math.round(numUnits * fanMult);
  // Two price ladders, decided by whether a fan finish level has been chosen —
  // both GROSS on the sheet, both net of the $35 disk credit here (a 12" disk
  // comes out of the base when a fan goes in):
  //   - no level yet (conceptual budget): the flat conceptual fan price (Mike
  //     2026-09-05: "$180 … should be gross"), so $180 − $35 = $145 per fan;
  //   - a level (design questionnaire): that level's price minus the credit.
  // The conceptual questionnaire never saves a level; the design one always does.
  // An old frozen sheet with no conceptual price falls to the legacy NET adder.
  const fanDiskCredit = n(PRICING.fans?.diskCredit, 35);
  const fanLevelKey  = (units.fanLevel && PRICING.designFanLevels?.[units.fanLevel]) ? units.fanLevel : null;
  let fanPricePerFan;
  if (fanLevelKey) {
    fanPricePerFan = Math.max(0, n(PRICING.designFanLevels[fanLevelKey]) - fanDiskCredit);
  } else {
    fanPricePerFan = n(PRICING.fans?.conceptualPerFan) > 0
      ? Math.max(0, n(PRICING.fans.conceptualPerFan) - fanDiskCredit)
      : n(PRICING.fans?.adderPerFan, 145);
  }
  // Override is the NET adder per fan — the $35 disk credit is NOT subtracted from
  // it. Typing $200 means $200 per fan.
  const fanOverride = (units.fans || 'none') !== 'none' ? priceOverride(units.fansPrice) : null;
  if (fanOverride !== null) fanPricePerFan = fanOverride;
  const fansProduct = fanCount * fanPricePerFan;

  // Vanity lighting: master holds GROSS; subtract the bath-bar credit per vanity
  // (the base $0.38/SF already includes a bath bar). bathBarLow (gross 0) stays 0.
  const vanityCredit   = n(PRICING.vanityBathBarCredit, 45);
  const vanityPricing  = PRICING.vanity[units.vanity || 'bathBarLow'] || PRICING.vanity.bathBarLow;
  const vanityGross    = n(vanityPricing.product);
  // Override is the NET adder per vanity — the $45 bath-bar credit is NOT taken off
  // it. 'bathBarLow' IS the base (no upgrade selected), so no override applies there.
  const vanityChosen   = (units.vanity || 'bathBarLow') !== 'bathBarLow';
  const vanityOverride = vanityChosen ? priceOverride(units.vanityPrice) : null;
  const vanityNet      = vanityOverride !== null
    ? vanityOverride
    : (vanityGross > 0 ? Math.max(0, vanityGross - vanityCredit) : 0);
  const vanityProduct  = vanityNet * numVanities;

  // Balcony fixtures
  const balconyPricing = PRICING.balcony[units.balcony || 'none'] || PRICING.balcony.none;
  const balconyChosen  = (units.balcony || 'none') !== 'none';
  const balconyUnit    = balconyChosen
    ? (priceOverride(units.balconyPrice) ?? n(balconyPricing.product))
    : 0;
  const balconyProduct = balconyUnit * numBalconies;

  // Manual adder
  const unitsManualAdder = n(units.manualAdder);

  const unitsProductTotal = baseProduct + undercabinetProduct + pendantsProduct + fansProduct + vanityProduct + balconyProduct + unitsManualAdder;

  // ─── CORRIDORS / STAIRWELLS ───────────────────────────────────────────────
  // Disk rate: conceptual budget uses 0.27/SF (10ft average). Design questionnaire
  // applies the exact spacing-adjusted rate from the pricing table.
  let diskRate = PRICING.corridors.diskPerSf; // 0.27 default (10ft avg)
  if (corridorSf > 0 && corridors.fixtureSpacing) {
    const spacing = parseInt(corridors.fixtureSpacing) || 10;
    if (corridors.fixtureType === 'recessed') {
      diskRate = (PRICING.designCorridors?.recessedSpacingRates || {})[spacing] ?? diskRate;
    } else {
      diskRate = (PRICING.designCorridors?.diskSpacingRates || {})[spacing] ?? diskRate;
    }
  }
  const diskProduct = corridorSf * diskRate;

  // Unit-entry sconces
  const sconcePricing    = PRICING.corridorSconce[corridors.unitSconce || 'none'] || PRICING.corridorSconce.none;
  const sconceChosen     = (corridors.unitSconce || 'none') !== 'none';
  const sconceUnit       = sconceChosen
    ? (priceOverride(corridors.unitSconcePrice) ?? n(sconcePricing.product))
    : 0;
  const sconceProduct    = sconceUnit * numUnits;

  // Stairwells. Enclosed corridor-building stairs: LED strip + battery per
  // landing. Breezeway walk-ups (garden / stacked flats / gurban): the same
  // landing × 2.2, because the open breezeway is the corridor and the stair in
  // one (Mike 2026-09-12). Same landings count feeds both.
  const breezewayStairs  = breezewayStairPackage(
    { landings: stairwells, stories: n(pd.numFloors), buildingTypeKey },
    PRICING,
  );
  const stairwellProduct = breezewayStairs
    ? breezewayStairs.product
    : stairwells * PRICING.corridors.stairwellPerLanding.product;

  // Recessed accent downlights (fire-rated adjustable)
  const accentProduct = numAccents > 0
    ? numAccents * n(PRICING.designCorridors?.accentDownlightEach, 120)
    : 0;

  // Manual adder
  const corridorsManualAdder = n(corridors.manualAdder);

  const corridorProductTotal = diskProduct + sconceProduct + stairwellProduct + accentProduct + corridorsManualAdder;

  // ─── BOH / CORE + SHELL ───────────────────────────────────────────────────
  const bohBaseProduct = bohSf * PRICING.boh.perSf;
  const bohManualAdder = n(projectData.bohManualAdder);
  const bohProduct = bohBaseProduct + bohManualAdder;

  // ─── INTERIOR AMENITIES ───────────────────────────────────────────────────
  const intLevelRaw = amenities.interiorLevel || 'medium';
  let intAmenityRate;
  if      (intLevelRaw === 'low')    intAmenityRate = PRICING.interiorAmenities.low;
  else if (intLevelRaw === 'medium') intAmenityRate = PRICING.interiorAmenities.medium;
  else if (intLevelRaw === 'high')   intAmenityRate = PRICING.interiorAmenities.high;
  else {
    const parsed = parseFloat(intLevelRaw);
    intAmenityRate = (isFinite(parsed) && parsed > 0) ? parsed : PRICING.interiorAmenities.medium;
  }
  const intAmenityBaseProduct = intAmenitySf * intAmenityRate;
  const interiorManualAdder = n(amenities.manualAdder);
  const intAmenityProduct = intAmenityBaseProduct + interiorManualAdder;

  // ─── GARAGE ───────────────────────────────────────────────────────────────
  const garageBaseProduct = garageSf * PRICING.garage.perSf;
  const garageManualAdder = n(projectData.garageManualAdder);
  const garageProduct = garageBaseProduct + garageManualAdder;

  // ─── EXTERIOR ─────────────────────────────────────────────────────────────
  const extLevelRaw = exterior.amenityLevel || 'medium';
  let extAmenityRate;
  if      (extLevelRaw === 'low')       extAmenityRate = PRICING.exteriorAmenities.low;
  else if (extLevelRaw === 'lowMedium') extAmenityRate = PRICING.exteriorAmenities.lowMedium ?? 2;
  else if (extLevelRaw === 'medium')    extAmenityRate = PRICING.exteriorAmenities.medium;
  else if (extLevelRaw === 'high')      extAmenityRate = PRICING.exteriorAmenities.high;
  else {
    const parsed = parseFloat(extLevelRaw);
    extAmenityRate = (isFinite(parsed) && parsed > 0) ? parsed : PRICING.exteriorAmenities.medium;
  }

  const amenityHours    = exterior.amenityHours || 'beforeDusk';
  // Only '24hrs or after dark' doubles the exterior amenity line (Mike,
  // 2026-09-01: "dusk to dawn does not get the 2x multiplier. it is as is cost").
  const nightMultiplier = amenityHours === 'afterSunset' ? PRICING.exteriorAmenities.nighttimeMultiplier : 1;
  const extAmenityProduct = extAmenitySf * extAmenityRate * nightMultiplier;

  const stallsPerFixture = PRICING.exterior.surfaceParking.stallsPerFixture ?? 9;
  // Drive-lane area lights: the same area light + pole, along a private drive
  // with no parking lot to hang them on (a townhouse community's one road).
  // Set by the no-drawings estimate (quantities.js driveLaneLights); 0 unless
  // something passed a count.
  const driveLaneLights  = Math.max(0, Math.round(n(exterior.driveLaneLightsQty, 0)));
  const stallFixtures    = Math.ceil(surfaceParking / stallsPerFixture);
  // One editable area-light count (Mike, 2026-09-12): a typed total on the
  // Exterior screen replaces lot poles + drive-lane lights together.
  const areaLightsOverride = priceOverride(exterior.areaLightsQty);
  const parkingFixtures  = areaLightsOverride != null
    ? Math.max(0, Math.round(areaLightsOverride))
    : stallFixtures + driveLaneLights;
  // Solar site design multiplies the area-lighting (surface parking) line —
  // each fixture carries its own panel, battery and controller. Mike 2026-09-04
  // (Fulshear review): "Solar lighting should add 2.5x to the area lighting.
  // Should have a note that labor should be reduced dramatically because of no
  // need for trenching and running conduit and wire." The multiplier lives in
  // master pricing (exterior.solarMultiplier); the note ships in sections.exterior.solar.
  const solarSite       = exterior.siteDesignLevel === 'solar';
  const solarMultiplier = solarSite ? n(PRICING.exterior.solarMultiplier, 2.3) : 1;
  const parkingProduct   = parkingFixtures * (PRICING.exterior.surfaceParking.perFixture ?? PRICING.exterior.surfaceParking.perStall ?? 1325) * solarMultiplier;
  const carportProduct   = Math.floor(numCarports / 2) * PRICING.exterior.carport.diskEveryOther;
  const garageExtProduct = numGarages * PRICING.exterior.detachedGarage.sconcePerDoor;

  // Building wallpacks — per-BUILDING model, wired per Mike 2026-08-12: "Wire it
  // but give us a manual override of quantity and unit price."
  //
  // This line REPLACED the old "exterior door sconces" line (doors × $212.50
  // avg) on 2026-08-12 — Mike: "These are the same, so we need to use what we
  // figured out today and delete the old one." One fixture, one line. The
  // numExteriorDoors project field survives; drawing takeoffs will use it to
  // refine the wallpack count.
  //
  //   wallpacks = buildings × perBuilding[type] (+ clubhouse on horizontal types)
  //   dollars   = wallpacks × perFixture
  //
  // Building count: the # of Buildings project field wins; walk-up types fall
  // back to units ÷ unitsPerBuilding; vertical types are one building. Validated
  // on Lowell + I76: 7 buildings × 4 + 5 = 33 vs ILC's hand guess of 34.
  //
  // Both overrides go through priceOverride(): blank/'auto'/garbage → the model,
  // a real number (including 0) → exactly that. A zero-scale project (no units
  // AND no building count) prices at $0 rather than charging a phantom clubhouse.
  const wp             = PRICING.exterior.wallpacks || {};
  const wpBuildingType = buildingTypeKey;
  const wpPerBuilding  = wp.perBuilding?.[wpBuildingType] ?? 0;
  const wpIsWalkUp     = ['stackedFlats', 'garden', 'gurban'].includes(wpBuildingType);
  const wpIsHorizontal = wpIsWalkUp || ['singleFamily', 'townHouses'].includes(wpBuildingType);
  const wpBuildings    = n(pd.numBuildings) > 0
    ? n(pd.numBuildings)
    : wpIsWalkUp
      ? Math.ceil(numUnits / (wp.unitsPerBuilding?.[wpBuildingType] ?? 24))
      : 1;
  const wpHasScale = n(pd.numBuildings) > 0 || numUnits > 0;
  const wpAutoQty  = wpHasScale
    ? wpBuildings * wpPerBuilding + (wpIsHorizontal ? (wp.clubhouse ?? 0) : 0)
    : 0;
  const wpQty          = priceOverride(exterior.wallpacksQty)   ?? wpAutoQty;
  const wpEach         = priceOverride(exterior.wallpacksPrice) ?? (wp.perFixture ?? 350);
  const wallpackProduct = wpQty * wpEach;

  // Landscape: 2% of NET lot SF — lot minus the building footprint (the ground
  // the fixtures can actually sit on). Mike 2026-09-04: "net lot". Before that
  // the line multiplied the FULL lot (which is what the Excel does too — one
  // of the reasons Excel and app landscape figures differ on big sites). Falls
  // back to the full lot when no footprint is on file rather than pricing $0.
  //
  // Historical note: `exterior.landscapeBudget` was a manual override
  // field on the wizard before mid-2026. The input was removed from the
  // UI when the Exterior step was redesigned; new projects route manual
  // landscape additions through `exteriorManualItems.manualExteriorAdder`
  // instead. Engine reference removed 2026-06-22 along with the only
  // remaining project that used it (Mike's "The Approach").
  // Capped at landscape.maxTotal — the questionnaire's stated ceiling. The rate
  // and the cap both come from master pricing now; this line used to hardcode
  // 0.02 and ignore PRICING.exterior.landscape entirely, so editing the rate in
  // the pricing admin had no effect on any budget.
  const landscapePct  = PRICING.exterior.landscape?.pctOfNetLotSf ?? 0.02;
  const landscapeCap  = PRICING.exterior.landscape?.maxTotal ?? 3000;
  const netLotSf      = footprintSf > 0 ? Math.max(lotSf - footprintSf, 0) : lotSf;
  const landscapeRaw  = netLotSf > 0 ? netLotSf * landscapePct : 0;
  const landscapeFlat = Math.min(landscapeRaw, landscapeCap);

  // Manual override: site/exterior is frequently hand-calculated outside the
  // formula (manually built in the spreadsheet). A positive exteriorOverride
  // replaces the formula total entirely. Mirrors controlsOverride. The formula
  // breakdown is still returned for transparency (see sections.exterior.formulaTotal).
  const exteriorOverrideVal  = n(exterior.exteriorOverride);
  const exteriorOverrideUsed = exteriorOverrideVal > 0;

  // Manual adder section: the 3 items the formula does NOT compute — pathway
  // lighting, parking entrances, and a catch-all manual adder. These ADD on
  // top of the formula breakdown and DO participate in the 5% misc buffer
  // calculation per Mike's decision 2026-06-22 (the buffer is a "general
  // coverage" line, not specific to formula items; manual entries are real
  // scope and the buffer should scale with them too).
  let exteriorManualItems = exterior.exteriorManualItems;
  if (typeof exteriorManualItems === 'string') {
    try { exteriorManualItems = JSON.parse(exteriorManualItems); } catch { exteriorManualItems = null; }
  }
  exteriorManualItems = exteriorManualItems || {};
  const exteriorManualTotal =
      n(exteriorManualItems.pathwayLighting)
    + n(exteriorManualItems.parkingEntrances)
    + n(exteriorManualItems.manualExteriorAdder);

  // Pathway lighting: $/unit by building type, from master pricing
  // (exterior.pathway.dollarsPerUnit), floored at pathway.minTotal for any
  // project with real scale. Wired 2026-09-04 on Mike's sign-off of the
  // corrected table (townhome $320 kept, wrap $60, garden/stacked/gurban $60,
  // podium/mid/high $35 — his numbers, all inside the observed calibration
  // bands). A hand-entered pathway figure in exteriorManualItems wins and
  // SUPPRESSES the model line — projects like Modera Town Lake carry a real
  // counted number there, and the model must not stack on top of it.
  // Zero-scale (no units) prices at $0, same rule as wallpacks.
  // Solar sites bump the MODEL line by pathway.solarMultiplier (1.6 — Mike
  // 2026-09-04; solar bollards run ~1.5× conventional on the Avilla actuals).
  // Applied after the floor so a floored site still gets the solar premium.
  const pwRates        = PRICING.exterior.pathway?.dollarsPerUnit || {};
  const pathwayRate    = pwRates[wpBuildingType] ?? 0;
  const pathwayFloor   = n(PRICING.exterior.pathway?.minTotal);
  const pathwayManual  = n(exteriorManualItems.pathwayLighting);
  const pathwaySolarMultiplier = solarSite ? n(PRICING.exterior.pathway?.solarMultiplier, 1.6) : 1;
  const pathwayBase    = numUnits > 0 && pathwayRate > 0
    ? Math.max(numUnits * pathwayRate, pathwayFloor)
    : 0;
  // Townhomes and single-family are asked "Light the walking paths with
  // bollards?" (Mike, 2026-09-12). No — the default, and what the real townhome
  // budgets on file show — is $0; Yes is the model line above.
  const pathwayAsksBollards = wpBuildingType === 'townHouses' || wpBuildingType === 'singleFamily';
  const pathwayBollardsDeclined = pathwayAsksBollards && exterior.pathwayBollards !== 'yes';
  const pathwayAuto    = pathwayBollardsDeclined ? 0 : pathwayBase * pathwaySolarMultiplier;
  const pathwayProduct = pathwayManual > 0 ? 0 : pathwayAuto;

  // Misc buffer = 5% of formula-line subtotal + manual adder. Both contribute.
  const extSubBeforeMisc     = extAmenityProduct + parkingProduct + carportProduct + garageExtProduct + wallpackProduct + landscapeFlat + pathwayProduct;
  const extBufferBase        = extSubBeforeMisc + exteriorManualTotal;
  const extMiscBuffer        = extBufferBase * PRICING.exterior.miscBufferPct;
  const exteriorFormulaTotal = extSubBeforeMisc + extMiscBuffer;

  // Override replaces everything; otherwise formula breakdown + manual adder.
  // (The buffer's contribution from the manual portion is already in
  // exteriorFormulaTotal via extMiscBuffer.)
  const exteriorProductTotal = exteriorOverrideUsed
    ? exteriorOverrideVal
    : exteriorFormulaTotal + exteriorManualTotal;

  // ─── EMERGENCY LIGHTING ───────────────────────────────────────────────────
  // One shared helper (src/lib/emergencyCost.js) so both Emergency screens show
  // exactly this number. Every strategy but 'generator' puts a battery in every
  // other garage fixture when there is a garage (Mike, 2026-09-12).
  // Unanswered = Frogeyes, the lowest-cost fixture strategy — the same starting
  // answer as the public form (Mike, 2026-09-12: "should start in frogeyes").
  const strategyKey = emergency.strategy || 'frogeyes';
  const emergencyCost = emergencyStrategyCost(PRICING, strategyKey, { corridorSf, intAmenitySf, garageSf });
  const emergencyManualAdder = n(emergency.manualAdder);
  const emergencyProduct = emergencyCost.total + emergencyManualAdder;

  // ─── EXIT SIGNS ───────────────────────────────────────────────────────────
  // Large-project threshold: per pricing.js, exit signs cost is halved when
  // the project exceeds the large-project threshold (default 300,000 SF).
  // Before this rule was applied, large projects were over-billed at full rate.
  const exitSignsRaw     = grossSf * PRICING.exitSigns.perSf;
  const exitSignsCutoff  = n(PRICING.exitSigns.largeProjectThreshold, 300000);
  const exitSignsBaseProduct = grossSf > exitSignsCutoff ? exitSignsRaw / 2 : exitSignsRaw;
  const exitSignsManualAdder = n(projectData.exitSignsManualAdder);
  const exitSignsProduct = exitSignsBaseProduct + exitSignsManualAdder;

  // ─── DESIGN BUDGET ADDERS ────────────────────────────────────────────────
  // NOTE: The base rate (grossSf × $0.38) already includes the standard design
  // package: 7" flat edge-lit disk, decorative unit entry, 4 dimmers/unit.
  // Only charge adders for meaningful deviations from that default.
  let designAdderTotal = 0;

  // Backlit rounded disk: credit vs default flat edge-lit (-$0.04/SF of units SF)
  if (units.diskType === 'backlit') {
    designAdderTotal += unitsSf * n(PRICING.designUpgrades?.diskBacklitRoundedPerSf, -0.04);
  }

  // Boiler/HVAC room disk ($15/unit extra light)
  if (units.boilerRoom === 'yes') {
    designAdderTotal += numUnits * n(PRICING.designUpgrades?.boilerRoomDisk, 15);
  }

  // Living room: (4) small disks vs (1) 12" disk — $34/unit adder
  if (units.livingRoomDisks === '4small') {
    designAdderTotal += numUnits * n(PRICING.designUpgrades?.livingRoom4Disks, 34);
  }

  // Entry disk upgrade — 12" oversized or decorative surface mount.
  // Default 'typical' (5"/7" disk, included in base) has no adder.
  // Both answers are saved on the Units step, so they live under `units` —
  // reading them off the top-level responses (as this did before 2026-09-12)
  // never found them, and the upgrade the screen showed was never charged.
  // 'upgraded12' is the older spelling of the 12" answer.
  if (units.entryDisk === '12inch' || units.entryDisk === 'upgraded12') {
    designAdderTotal += numUnits * n(PRICING.designUpgrades?.entryway12inch, 25);
  } else if (units.entryDisk === 'decorative') {
    designAdderTotal += numUnits * n(PRICING.designUpgrades?.entryDecorative, 30);
  }

  // 52" fan upgrade over the 48" default (only counts when fans are present).
  // Master pricing sets this to $0 today — no upcharge, per Mike.
  if (units.fanSize52 === 'yes' && fanCount > 0) {
    designAdderTotal += fanCount * n(PRICING.designUpgrades?.fanSize52Adder, 0);
  }

  // Stairwell elevated design adder
  if (corridors.stairwellDesign === 'elevated') {
    designAdderTotal += stairwells * n(PRICING.designCorridors?.stairwellElevatedAdder, 50);
  }

  // Garage design level — replaces the flat garage $/SF. Rates come from master
  // pricing (designGarage); the fallbacks match the sheet. 'standard'/'medium'
  // is the base level, 'enhanced'/'high' the upgraded one.
  // Only the BASE garage line is swapped out — a typed garage manual adder
  // stays on top (it used to be wiped out here).
  if (corridors.garageDesignLevel && garageSf > 0) {
    const DG = PRICING.designGarage || {};
    const baseGarageRate = (corridors.garageDesignLevel === 'enhanced' || corridors.garageDesignLevel === 'high')
      ? n(DG.baseHighPerSf, 0.25)
      : n(DG.baseMediumPerSf, 0.20);
    // Controls adder. When the Emergency line already buys the garage
    // batteries (every strategy but generator), the battery part of these
    // options is not charged twice: 'battery' adds nothing and
    // 'batteryAndSensor' adds only the sensor.
    const batteriesOnEmergency = emergencyCost.garageBattery;
    let garageCtrlRate = 0;
    if      (corridors.garageControls === 'daylighting')      garageCtrlRate = n(DG.daylightingAdderPerSf, 0.10);
    else if (corridors.garageControls === 'batteryAndSensor') garageCtrlRate = batteriesOnEmergency ? n(DG.occSensorAdderPerSf, 0.02) : n(DG.batteryAndSensorPerSf, 0.06);
    else if (corridors.garageControls === 'battery')          garageCtrlRate = batteriesOnEmergency ? 0 : n(DG.batteryAdderPerSf, 0.05);
    else if (corridors.garageControls === 'occSensor')        garageCtrlRate = n(DG.occSensorAdderPerSf, 0.02);

    const garageDesignTotal = garageSf * (baseGarageRate + garageCtrlRate);
    designAdderTotal += garageDesignTotal - garageBaseProduct;
  }

  // Exit sign type — count-based for all three types. Replaces only the base
  // exit-sign line; a typed exit-sign manual adder stays on top.
  // Count and price live out here so the per-answer cost table can reuse them.
  const DX = PRICING.designExitSigns || {};
  const signCount = grossSf > 0 ? Math.max(1, Math.ceil(grossSf / n(DX.sfPerSign, 5000))) : 0;
  let signCost = 0;
  if      (corridors.exitSignType === 'edgelit')  signCost = n(DX.edgelitPerSign,       120);
  else if (corridors.exitSignType === 'mixed')    signCost = n(DX.mixedPerSign,          75);
  else if (corridors.exitSignType)                signCost = n(DX.thermoplasticPerSign,  22);
  if (corridors.exitSignType && grossSf > 0) {
    designAdderTotal += signCount * signCost - exitSignsBaseProduct;
  }

  // ─── SUBTOTALS ────────────────────────────────────────────────────────────
  let lightingProductSubtotal =
    unitsProductTotal    +
    corridorProductTotal +
    bohProduct           +
    intAmenityProduct    +
    garageProduct        +
    exteriorProductTotal +
    emergencyProduct     +
    exitSignsProduct     +
    designAdderTotal;

  // ─── ENERGY CREDIT ───────────────────────────────────────────────────────
  // Per Mike (2026-09-01): pursuing any energy credit program ADDS this % to
  // BOTH the lighting and controls subtotals, each shown as its own line item
  // (better-than-code LPDs need more efficient fixtures and more sophisticated
  // controls). Applied before freight/warehousing/tax on each side.
  const energyCreditPct = controls.energyCredit === 'yes'
    ? n(PRICING.controls.energyCreditAdderPct, 0.03)
    : 0;
  const energyCreditLighting = lightingProductSubtotal * energyCreditPct;
  lightingProductSubtotal += energyCreditLighting;

  // ─── CONTROLS ─────────────────────────────────────────────────────────────
  // Controls apply to total gross SF (IECC 2021 — Excel-verified)
  const buildingType = buildingTypeKey;
  const ctrlRate     = PRICING.controls.rates[buildingType] || PRICING.controls.rates.midRise;
  // Two ceilings, and the lower one wins: the building type's own cap (garden
  // $65K … high-rise $190K) AND the sheet-wide "never over $180K" cap. Before
  // 2026-09-04 the sheet-wide cap silently REPLACED the type cap whenever it was
  // present, so a garden project could be charged up to $180K of controls.
  const controlsCap  = Math.min(n(ctrlRate.cap, Infinity), n(PRICING.controls.cap, Infinity));
  let controlsProduct = Math.min(grossSf * ctrlRate.perSf, controlsCap);

  // Manual override — an explicit override replaces the formula result.
  const controlsOverrideVal = n(controls.controlsOverride);
  if (controlsOverrideVal > 0) controlsProduct = controlsOverrideVal;

  // Energy credit adds the same % to the controls side as its own line item.
  // It sits on top of an override the way freight and tax do.
  const energyCreditControls = controlsProduct * energyCreditPct;

  // Freight & warehousing rates
  const freightRate     = (pd.freightPct     != null && isFinite(pd.freightPct))     ? pd.freightPct     : PRICING.freight;
  const warehousingRate = (pd.warehousingPct != null && isFinite(pd.warehousingPct)) ? pd.warehousingPct : PRICING.warehousing;

  const freightAmount     = lightingProductSubtotal * freightRate;
  const warehousingAmount = lightingProductSubtotal * warehousingRate;
  const lightingTaxAmount = lightingProductSubtotal * salesTaxPct;

  const subtotalLightingOnly = lightingProductSubtotal + freightAmount + warehousingAmount + lightingTaxAmount;

  const controlsSubtotal    = controlsProduct + energyCreditControls;
  const controlsFreight     = controlsSubtotal * freightRate;
  const controlsWarehousing = controlsSubtotal * warehousingRate;
  const controlsTaxAmount   = controlsSubtotal * salesTaxPct;
  const controlsTotal       = controlsSubtotal + controlsFreight + controlsWarehousing + controlsTaxAmount;

  const totalWithControls = subtotalLightingOnly + controlsTotal;

  // Contingency — held against the lighting product subtotal as a separate
  // line item beneath the totals. UI lives on the Project Data step (design
  // mode for now); engine honors the stored value regardless of mode.
  // Selection values: 'none' / undefined → 0, '5pct' → 0.05, '10pct' → 0.10.
  // Applied to lightingProductSubtotal per the UI note "5–10% of lighting
  // subtotal." Does NOT trigger additional freight/warehousing.
  const contingencyRate =
        projectDataR.contingency === '5pct'  ? 0.05
      : projectDataR.contingency === '10pct' ? 0.10
      : 0;
  const contingencyAmount    = lightingProductSubtotal * contingencyRate;
  const totalWithContingency = totalWithControls + contingencyAmount;

  const perSf   = grossSf  > 0 ? totalWithContingency / grossSf  : 0;
  const perUnit = numUnits > 0 ? totalWithContingency / numUnits : 0;

  // ─── PER-ANSWER COST + LABOR ──────────────────────────────────────────────
  // What each answer costs, shown next to that answer on every questionnaire
  // screen (internal and public) so a client can weigh the choice (Mike
  // 2026-09-13). Keyed "section.field". Labor is an ESTIMATE shown beside the
  // product; it is never added to any total above. RAW rates, no OH&P.
  const L = PRICING.labor || {};
  const lab = k => n(L[k]);
  const questionCosts = {};
  const line = (label, count, countLabel, each, laborEach) => ({
    label, count, countLabel, each, product: count * each,
    laborEach, labor: count * laborEach,
  });
  const addQ = (key, lines) => {
    const ls = lines.filter(Boolean);
    questionCosts[key] = {
      lines:   ls,
      product: ls.reduce((s, l) => s + l.product, 0),
      labor:   ls.reduce((s, l) => s + l.labor, 0),
    };
  };

  // Undercabinet: 8 ft per kitchen — 120V in 24" pieces, low voltage per foot of tape.
  const ucKey = units.undercabinet || 'none';
  const ucFt  = n(L.undercabinetFtPerUnit, 8);
  const ucLaborEach = ucKey === 'lineVoltage' ? Math.ceil(ucFt / 2) * lab('undercabinet24in')
                    : ucKey === 'lowVoltage'  ? ucFt * lab('tapePerFt')
                    : 0;
  addQ('units.undercabinet', [ucKey !== 'none' && line('Undercabinet', numUnits, 'units', n(ucPricing.product), ucLaborEach)]);

  // Pendants: labor per pendant hung, by how many the answer hangs.
  const pKey = units.kitchenPendants || 'none';
  const pendantsPerUnit = pKey.startsWith('threeSmall') ? 3 : pKey.startsWith('twoMedium') ? 2 : pKey === 'none' ? 0 : 1;
  addQ('units.kitchenPendants', [pendantsChosen && line('Kitchen pendants', numUnits, 'units', pendantsUnit, pendantsPerUnit * lab('pendant'))]);

  // Fans — the fan-rooms answer and the design fan-level answer share one line.
  const fansLine = fanCount > 0 ? line('Ceiling fans', fanCount, 'fans', fanPricePerFan, lab('ceilingFan')) : null;
  addQ('units.fans',     [fansLine]);
  addQ('units.fanLevel', [fansLine]);

  // Vanity: a lighted mirror installs on a mirror j-box; a bath bar like a sconce.
  const vKey = units.vanity || 'bathBarLow';
  const vanityLaborEach = vKey.startsWith('illuminatedMirror') ? lab('mirrorJBox') : lab('sconce');
  addQ('units.vanity', [numVanities > 0 && line('Vanity lighting', numVanities, 'vanities', vanityNet, vanityLaborEach)]);

  // Balcony: 5" disk or a sconce, one per balcony.
  const bKey = units.balcony || 'none';
  addQ('units.balcony', [balconyChosen && line('Balcony fixture', numBalconies, 'balconies', balconyUnit, bKey === 'disk5inch' ? lab('surfaceDisk') : lab('sconce'))]);

  // Design-screen unit adders.
  addQ('units.boilerRoom', [units.boilerRoom === 'yes' && line('Boiler room disk', numUnits, 'units', n(PRICING.designUpgrades?.boilerRoomDisk, 15), lab('surfaceDisk'))]);
  addQ('units.livingRoomDisks', [units.livingRoomDisks === '4small' && line('Living room (4) small disks', numUnits, 'units', n(PRICING.designUpgrades?.livingRoom4Disks, 34), 3 * lab('surfaceDisk'))]);

  // Corridors: one unit-entry sconce per unit.
  addQ('corridors.unitSconce', [sconceChosen && line('Unit entry sconce', numUnits, 'units', sconceUnit, lab('sconce'))]);

  // Stairs: one 4 ft strip per landing (a breezeway landing carries the
  // breezeway multiplier's worth of fixtures), plus the elevated adder.
  const elevatedAdder = corridors.stairwellDesign === 'elevated' ? n(PRICING.designCorridors?.stairwellElevatedAdder, 50) : 0;
  const perLanding = breezewayStairs ? n(breezewayStairs.ratePerLanding) : n(PRICING.corridors.stairwellPerLanding.product);
  const stripsPerLanding = breezewayStairs ? n(breezewayStairs.multiplier, 1) : 1;
  addQ('corridors.stairwellDesign', [stairwells > 0 && line('Stair landings', stairwells, 'landings', perLanding + elevatedAdder, stripsPerLanding * lab('strip4ft'))]);

  // Exit signs.
  addQ('corridors.exitSignType', [corridors.exitSignType && signCount > 0 && line('Exit signs', signCount, 'signs', signCost, lab('exitSign'))]);

  // Area lights: pole + base, plus trenching (none on a solar site).
  const poleEach = (PRICING.exterior.surfaceParking.perFixture ?? PRICING.exterior.surfaceParking.perStall ?? 1325) * solarMultiplier;
  addQ('exterior.siteDesignLevel', [parkingFixtures > 0 && line(solarSite ? 'Solar area lights' : 'Area lights', parkingFixtures, 'poles', poleEach, lab('areaPole') + (solarSite ? 0 : lab('trenching')))]);

  // Wallpacks.
  addQ('exterior.wallpacksQty', [wpQty > 0 && line('Wallpacks', wpQty, 'wallpacks', wpEach, lab('sconce'))]);

  // Pathway bollards: priced per unit, no fixture count → product only.
  addQ('exterior.pathwayBollards', [pathwayProduct > 0 && { label: 'Walking-path lighting', count: null, countLabel: null, each: null, product: pathwayProduct, laborEach: null, labor: 0 }]);

  // $/SF lines — cost only, no labor (Mike 2026-09-13: "Leave labor off of those").
  const sfLine = (label, product) => product > 0 ? { label, count: null, countLabel: null, each: null, product, laborEach: null, labor: 0 } : null;
  addQ('amenities.interiorLevel', [sfLine('Interior amenity lighting', intAmenityBaseProduct)]);
  addQ('exterior.amenityLevel',   [sfLine('Exterior amenity lighting', extAmenityProduct)]);
  addQ('exterior.amenityHours',   [sfLine('Exterior amenity lighting', extAmenityProduct)]);

  // Emergency: each frogeye installs like a wall sconce (Mike 2026-09-13).
  // One per 300 SF of corridor (plus amenity when frogeyes go everywhere).
  // Inverters, generators and integrated garage batteries: no labor figure.
  const frogeyeStrategies = ['frogeyes', 'frogeyes_inv', 'integrated_frogeyes'];
  const frogeyeSf = frogeyeStrategies.includes(strategyKey)
    ? corridorSf + (strategyKey === 'frogeyes' ? intAmenitySf : 0)
    : 0;
  const frogeyeCount = frogeyeSf > 0 ? Math.ceil(frogeyeSf / (n(L.frogeyeSfEach, 300) || 300)) : 0;
  const emergencyFixtureProduct = emergencyCost.total - n(emergencyCost.batteryCost);
  addQ('emergency.strategy', [
    frogeyeCount > 0
      ? { label: 'Frogeyes', count: frogeyeCount, countLabel: 'frogeyes', each: emergencyFixtureProduct / frogeyeCount, product: emergencyFixtureProduct, laborEach: lab('sconce'), labor: frogeyeCount * lab('sconce') }
      : sfLine('Emergency lighting', emergencyFixtureProduct),
    emergencyCost.garageBattery && n(emergencyCost.batteryCount) > 0
      ? line('Garage fixture batteries', n(emergencyCost.batteryCount), 'batteries', n(emergencyCost.batteryCost) / n(emergencyCost.batteryCount), 0)
      : null,
  ]);

  return {
    sections: {
      units: {
        base:         { product: baseProduct         },
        undercabinet: { product: undercabinetProduct  },
        pendants:     { product: pendantsProduct      },
        fans:         { product: fansProduct          },
        vanity:       { product: vanityProduct        },
        balcony:      { product: balconyProduct       },
        total:        { product: unitsProductTotal    },
      },
      corridors: {
        disks:      { product: diskProduct           },
        sconces:    { product: sconceProduct         },
        stairwells: {
          product:   stairwellProduct,
          landings:  stairwells,
          // Set only for breezeway walk-ups — the per-stair fixture package
          // behind the dollars, so any view can show the counts.
          breezeway: breezewayStairs,
        },
        accents:    { product: accentProduct         },
        total:      { product: corridorProductTotal  },
      },
      boh:      {
        product: bohProduct,
        // Surfaces the 5%-of-gross cap when it kicked in, so any view can say
        // "BOH capped at X SF (entered Y)".
        capped: bohCapSf != null && bohSfEntered > bohCapSf
          ? { enteredSf: bohSfEntered, capSf: bohCapSf }
          : null,
      },
      interior: { product: intAmenityProduct },
      garage:   { product: garageProduct     },
      exterior: {
        amenities: { product: extAmenityProduct    },
        parking:   { product: parkingProduct, fixtures: parkingFixtures, driveLaneLights, qtyOverridden: areaLightsOverride != null },
        carports:  { product: carportProduct       },
        garages:   { product: garageExtProduct     },
        // `doors` (sconce line) removed 2026-08-12 — same fixture as wallpacks.
        wallpacks: {
          product:       wallpackProduct,
          qty:           wpQty,
          autoQty:       wpAutoQty,
          each:          wpEach,
          buildings:     wpBuildings,
          qtyOverridden:   priceOverride(exterior.wallpacksQty)   != null,
          priceOverridden: priceOverride(exterior.wallpacksPrice) != null,
        },
        // Landscape — NET lot (lot − footprint) × pct, capped. `netLotSf` and
        // `capped` let every view print the same math the engine ran.
        landscape: {
          product:  landscapeFlat,
          lotSf,
          footprintSf,
          netLotSf,
          pct:      landscapePct,
          capped:   landscapeRaw > landscapeCap,
        },
        // Pathway lighting — model line wired 2026-09-04. `suppressedByManual`
        // means a hand-entered exteriorManualItems.pathwayLighting figure is
        // carrying the scope instead (it rides in manualAdderTotal).
        // `solarMultiplier` is 1 on conventional sites, pathway.solarMultiplier
        // (1.6) on solar sites — already baked into `product`.
        pathway: {
          product:            pathwayProduct,
          rate:               pathwayRate,
          buildingType:       wpBuildingType,
          floorApplied:       pathwayProduct > 0 && numUnits * pathwayRate < pathwayFloor,
          suppressedByManual: pathwayManual > 0,
          solarMultiplier:    pathwaySolarMultiplier,
          asksBollards:       pathwayAsksBollards,
          bollardsDeclined:   pathwayBollardsDeclined,
        },
        // Solar site design (Fulshear review, 2026-09-04): the parking product
        // above already includes the multiplier; the note rides along for every
        // summary/sidebar to display.
        solar: solarSite ? {
          multiplier: solarMultiplier,
          note: 'Solar site lighting: install labor should be reduced dramatically — no trenching, conduit, or wire runs to the poles.',
        } : null,
        misc:      { product: extMiscBuffer        },
        formulaTotal:     exteriorFormulaTotal,
        overrideApplied:  exteriorOverrideUsed,
        manualAdderTotal: exteriorManualTotal,
        total:     { product: exteriorProductTotal },
      },
      emergency:   {
        product:     emergencyProduct,
        strategy:    strategyKey,
        manualAdder: emergencyManualAdder,
        // Battery-in-every-other-fixture garage backup (every strategy but
        // generator, when there is a garage) — the count behind the dollars.
        garageBatteries: emergencyCost.garageBattery
          ? { count: emergencyCost.batteryCount, cost: emergencyCost.batteryCost }
          : null,
      },
      exitSigns:   { product: exitSignsProduct  },
      designAdder: { product: designAdderTotal  },
    },
    salesTaxPct,
    lightingTaxAmount,
    controlsTaxAmount,
    freight:                freightAmount,
    warehousing:            warehousingAmount,
    freightRate,
    warehousingRate,
    lightingProductSubtotal,
    energyCreditPct,
    energyCreditLighting,
    energyCreditControls,
    subtotalLightingOnly,
    controls:               controlsProduct,
    controlsSubtotal,
    controlsFreight,
    controlsWarehousing,
    controlsTotal,
    totalWithControls,
    contingencyRate,
    contingencyAmount,
    totalWithContingency,
    fanCount,
    questionCosts,
    perSf:   Math.round(perSf   * 100) / 100,
    perUnit: Math.round(perUnit),
  };
}

// Moved to format.js so public pages can print dollars without bundling
// the PRICING model; re-exported here for the existing internal imports.
export { formatCurrency } from './format.js';
