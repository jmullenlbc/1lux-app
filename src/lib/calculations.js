// Extension is explicit so plain Node (`node --test`) can load this file
// directly, the same way Next's bundler does. Without it the test runner cannot
// resolve './pricing'.
import { PRICING as STATIC_PRICING } from './pricing.js';

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

export function calculateBudget(projectData, responses = {}, pricingOverride = null) {
  const PRICING = pricingOverride || STATIC_PRICING;
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
  // Conceptual adderPerFan ($140) is already net of the disk credit. Design levels
  // (142/190/270) are GROSS, so subtract the $35 disk credit (a 12" disk is removed
  // from the base when a fan is added).
  const fanDiskCredit = n(PRICING.fans?.diskCredit, 35);
  // Default to the Medium design level the moment fans are chosen; picking a
  // different finish level (low/high) overrides it.
  const fanLevelKey  = (units.fanLevel && PRICING.designFanLevels?.[units.fanLevel]) ? units.fanLevel : 'medium';
  let fanPricePerFan = PRICING.fans.adderPerFan; // fallback if no design levels defined
  if (PRICING.designFanLevels?.[fanLevelKey]) {
    fanPricePerFan = Math.max(0, PRICING.designFanLevels[fanLevelKey] - fanDiskCredit);
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

  // Stairwell LED strips + battery backup
  const stairwellProduct = stairwells * PRICING.corridors.stairwellPerLanding.product;

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
  const parkingFixtures  = Math.ceil(surfaceParking / stallsPerFixture);
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
  const wpBuildingType = pd.buildingTypeKey || controls.buildingType || controls.projectType || 'midRise';
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

  // Landscape: 2% of total lot SF (Excel-verified formula).
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
  const landscapeFlat = lotSf > 0 ? Math.min(lotSf * landscapePct, landscapeCap) : 0;

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
  const pwRates        = PRICING.exterior.pathway?.dollarsPerUnit || {};
  const pathwayRate    = pwRates[wpBuildingType] ?? 0;
  const pathwayFloor   = n(PRICING.exterior.pathway?.minTotal);
  const pathwayManual  = n(exteriorManualItems.pathwayLighting);
  const pathwayAuto    = numUnits > 0 && pathwayRate > 0
    ? Math.max(numUnits * pathwayRate, pathwayFloor)
    : 0;
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
  const strategyKey = emergency.strategy || 'integrated_inverters';
  const strat = PRICING.emergency.strategies[strategyKey] || PRICING.emergency.strategies.frogeyes;

  // Frogeyes uses a single flat $/SF across all zones (editable: emergency.frogeyesPerSf).
  const frogeyesFlat = strategyKey === 'frogeyes' ? n(PRICING.emergency.frogeyesPerSf, 0.17) : null;
  const cRate = frogeyesFlat ?? strat.corridorPerSf;
  const aRate = frogeyesFlat ?? strat.amenityPerSf;
  const gRate = frogeyesFlat ?? strat.garagePerSf;

  let emergencyProduct =
    corridorSf   * cRate +
    intAmenitySf * aRate +
    garageSf     * gRate;

  if (strat.batteryGarage && garageSf > 0) {
    const b = PRICING.emergency.batteryGarage;
    const battCount = Math.floor((garageSf / b.sfPerFixture) / b.fixtureEvery);
    emergencyProduct += battCount * b.costPerFixture;
  }

  // Manual adder
  emergencyProduct += n(emergency.manualAdder);

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
  if (r.entryDisk === '12inch') {
    designAdderTotal += numUnits * n(PRICING.designUpgrades?.entryway12inch, 25);
  } else if (r.entryDisk === 'decorative') {
    designAdderTotal += numUnits * n(PRICING.designUpgrades?.entryDecorative, 30);
  }

  // 52" fan upgrade — $25/fan over 48" default (only counts when fans are present)
  if (r.fanSize52 === 'yes' && fanCount > 0) {
    designAdderTotal += fanCount * n(PRICING.designUpgrades?.fanSize52Adder, 25);
  }

  // Corridor elevated design adder (only when no specific spacing is set)
  if (corridorSf > 0 && !corridors.fixtureSpacing && corridors.corridorLevel === 'elevated') {
    designAdderTotal += corridorSf * n(PRICING.designCorridors?.elevatedAdderPerSf, 0.25);
  }

  // Stairwell elevated design adder
  if (corridors.stairwellDesign === 'elevated') {
    designAdderTotal += stairwells * n(PRICING.designCorridors?.stairwellElevatedAdder, 50);
  }

  // Garage design level — replaces flat $0.27/SF
  // CorridorsSection sends 'standard' ($0.30/SF) or 'enhanced' ($0.45/SF)
  if (corridors.garageDesignLevel && garageSf > 0) {
    let baseGarageRate;
    if (corridors.garageDesignLevel === 'enhanced' || corridors.garageDesignLevel === 'high') {
      baseGarageRate = n(PRICING.designGarage?.baseHighPerSf, 0.45);
    } else {
      // 'standard' or legacy 'medium'
      baseGarageRate = n(PRICING.designGarage?.baseMediumPerSf, 0.30);
    }
    // Controls adder
    let garageCtrlRate = 0;
    if      (corridors.garageControls === 'daylighting')     garageCtrlRate = 0.10;
    else if (corridors.garageControls === 'batteryAndSensor') garageCtrlRate = 0.06;
    else if (corridors.garageControls === 'battery')          garageCtrlRate = 0.05;
    else if (corridors.garageControls === 'occSensor')        garageCtrlRate = 0.02;

    const garageDesignTotal = garageSf * (baseGarageRate + garageCtrlRate);
    designAdderTotal += garageDesignTotal - garageProduct; // replaces flat garage product
  }

  // Exit sign type override — use count-based formula for all three types
  if (corridors.exitSignType && grossSf > 0) {
    const signCount = Math.max(1, Math.ceil(grossSf / n(PRICING.designExitSigns?.sfPerSign, 5000)));
    let signCost;
    if      (corridors.exitSignType === 'edgelit')  signCost = n(PRICING.designExitSigns?.edgelitPerSign,       127);
    else if (corridors.exitSignType === 'mixed')    signCost = n(PRICING.designExitSigns?.mixedPerSign,          75);
    else                                            signCost = n(PRICING.designExitSigns?.thermoplasticPerSign,  22);
    designAdderTotal += signCount * signCost - exitSignsProduct;
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
  const buildingType = pd.buildingTypeKey || controls.buildingType || controls.projectType || 'midRise';
  const ctrlRate     = PRICING.controls.rates[buildingType] || PRICING.controls.rates.midRise;
  const controlsCap  = n(PRICING.controls.cap, ctrlRate.cap);
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
        stairwells: { product: stairwellProduct      },
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
        parking:   { product: parkingProduct       },
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
        landscape: { product: landscapeFlat        },
        // Pathway lighting — model line wired 2026-09-04. `suppressedByManual`
        // means a hand-entered exteriorManualItems.pathwayLighting figure is
        // carrying the scope instead (it rides in manualAdderTotal).
        pathway: {
          product:            pathwayProduct,
          rate:               pathwayRate,
          buildingType:       wpBuildingType,
          floorApplied:       pathwayProduct > 0 && numUnits * pathwayRate < pathwayFloor,
          suppressedByManual: pathwayManual > 0,
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
      emergency:   { product: emergencyProduct  },
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
    perSf:   Math.round(perSf   * 100) / 100,
    perUnit: Math.round(perUnit),
  };
}

// Moved to format.js so public pages can print dollars without bundling
// the PRICING model; re-exported here for the existing internal imports.
export { formatCurrency } from './format.js';
