/**
 * ILC Studios — Internal Pricing Data
 * Source: Conceptual lighting & controls design multifamily questionnaire
 * All rates verified against Excel master template (26.04.17 Modera Town Lake).
 */

export const PRICING = {
  // ─── BASE UNIT DESIGN ──────────────────────────────────────────────────────
  base: {
    perSf: 0.38, // $/SF of residential units gross SF
  },

  // ─── UNDERCABINET LIGHTING ────────────────────────────────────────────────
  undercabinet: {
    none:        { product: 0,   labor: 0 },
    lineVoltage: { product: 125, labor: 0 }, // 120V line voltage
    lowVoltage:  { product: 220, labor: 0 }, // LED tape + channel + remote driver
  },

  // ─── KITCHEN ISLAND PENDANTS ──────────────────────────────────────────────
  // Per unit, cost delta vs. standard ceiling disk
  kitchenPendants: {
    none:             { product: 0,   labor: 0 },
    threeSmallLow:    { product: 120, labor: 0 }, // 3 × $40
    threeSmallMedium: { product: 300, labor: 0 }, // 3 × $100
    twoMediumLow:     { product: 176, labor: 0 }, // 2 × $88
    twoMediumMedium:  { product: 330, labor: 0 }, // 2 × $165
    oneLarge:         { product: 275, labor: 0 }, // 1 × $275
    oneLinear:        { product: 242, labor: 0 }, // 1 × $242
  },

  // ─── CEILING FANS ─────────────────────────────────────────────────────────
  // Net adder per fan = $175 gross - $35 disk credit already in base
  fans: {
    adderPerFan: 140, // net adder per fan location
    diskCredit:   35, // credit for 12" disk removed from base
    totalPerFan: 175, // gross product cost per fan
  },

  // ─── BATHROOM VANITY LIGHTING ─────────────────────────────────────────────
  // All costs are NET per vanity (product cost minus $45 bath bar base credit
  // except bathBarLow which is already included in base)
  // GROSS product prices. The engine subtracts vanityBathBarCredit per vanity
  // (a bath bar is already included in the $0.38/SF base). bathBarLow is the base.
  vanity: {
    bathBarLow:              { product: 0,   labor: 0 }, // the base bath bar — no charge
    illuminatedMirrorLow:    { product: 175, labor: 0 }, // gross; net = 175 - 45 = 130
    illuminatedMirrorMedium: { product: 200, labor: 0 }, // gross; net = 200 - 45 = 155
    illuminatedMirrorHigh:   { product: 250, labor: 0 }, // gross; net = 250 - 45 = 205
    bathBarMedium:           { product: 125, labor: 0 }, // gross; net = 125 - 45 = 80
    bathBarHigh:             { product: 250, labor: 0 }, // gross; net = 250 - 45 = 205
  },
  vanityBathBarCredit: 45, // $ credit per vanity (base already includes an LED bath bar)

  // ─── BALCONY / EXTERIOR UNIT FIXTURES ────────────────────────────────────
  balcony: {
    none:         { product: 0,   labor: 0 }, // no balcony fixture
    disk5inch:    { product: 15,  labor: 0 }, // 5" disk — $15/unit adder
    sconcelow:    { product: 55,  labor: 0 }, // upgrade from base disk → sconce low
    sconceMedium: { product: 135, labor: 0 }, // upgrade from base disk → sconce medium
    sconceHigh:   { product: 240, labor: 0 }, // upgrade from base disk → sconce high
  },

  // ─── CORRIDOR UNIT-ENTRY SCONCES ──────────────────────────────────────────
  corridorSconce: {
    none:       { product: 0,   labor: 0 },
    low:        { product: 55,  labor: 0 },
    medium:     { product: 125, labor: 0 },
    high:       { product: 300, labor: 0 },
    integrated: { product: 200, labor: 0 },
  },

  // ─── CORRIDOR FIELD LIGHTING ──────────────────────────────────────────────
  // Flat $/SF rate (bakes in 7" disk at 10ft spacing). Stairwells per landing.
  corridors: {
    diskPerSf: 0.27,             // $/SF of corridor area (7" disk @ 10ft spacing)
    stairwellPerLanding: {
      product: 175,              // 4ft LED strip w/ occupancy sensor + integrated battery backup
      labor:   0,
    },
  },

  // ─── INTERIOR AMENITIES ───────────────────────────────────────────────────
  interiorAmenities: {
    low:    6,
    medium: 10,
    high:   15,
  },

  // ─── EXTERIOR AMENITIES ───────────────────────────────────────────────────
  exteriorAmenities: {
    low:       1,
    lowMedium: 2,
    medium:    3,
    high:      5,
    nighttimeMultiplier: 2,
  },

  // ─── EXTERIOR SITE LIGHTING ───────────────────────────────────────────────
  exterior: {
    surfaceParking: {
      perFixture:      1325, // cost per area light + 30ft pole
      stallsPerFixture:   9, // approx 1 fixture covers 9 stalls
      solarUpgrade:    3000,
    },
    bollard: {
      perUnit: 800,
    },
    landscape: {
      // (lotSf - buildingFootprintSf) × 2% — entered manually in Exterior section
      pctOfNetLotSf: 0.02,
      // Hard ceiling. The source questionnaire says "add an estimate flat amount
      // for landscape lighting — for most projects do not exceed $3,000". Without
      // this cap the percentage runs away on large sites (a 1M SF lot returned
      // $20,000 against a stated $3,000 ceiling). Confirmed by Mike 2026-07-18.
      maxTotal: 3000,
    },
    carport: {
      diskEveryOther: 30,
      laborPerDisk:    0,
    },
    detachedGarage: {
      sconcePerDoor: 80,
    },
    exteriorDoor: {
      primarySconce:   350,
      secondarySconce: 75,
      // Target model (not yet wired to the formula): count floor-1 egress doors,
      // add 10%, and price one battery-backed wallpack each. Blocked on drawing
      // parsing (phase 2) for the door count. Placeholder rate set by Mike
      // 2026-07-18 — switching the formula to this will move the exterior door
      // line from $212.50/door to $300/door on every existing project, so it is
      // deliberately NOT live yet.
      wallpackWithBattery: 300,
      egressUpliftPct:     0.10,
    },
    miscBufferPct: 0.05, // 5% of exterior subtotal before misc
  },

  // ─── EMERGENCY / EGRESS LIGHTING ─────────────────────────────────────────
  // $/SF rates per space type per strategy
  emergency: {
    strategies: {
      generator: {
        corridorPerSf: 0,    amenityPerSf: 0,    garagePerSf: 0,    batteryGarage: false,
      },
      frogeyes: {
        // Flat rate everywhere — driven by emergency.frogeyesPerSf (the editable knob)
        corridorPerSf: 0.17, amenityPerSf: 0.17, garagePerSf: 0.17, batteryGarage: false,
      },
      frogeyes_inv: {
        // Frogeyes in corridors + inverters in amenities
        corridorPerSf: 0.15, amenityPerSf: 1.25, garagePerSf: 0,    batteryGarage: false,
      },
      integrated_frogeyes: {
        // Integrated batteries in garage + frogeyes corridors + inverters amenity
        corridorPerSf: 0.15, amenityPerSf: 1.25, garagePerSf: 0,    batteryGarage: true,
      },
      integrated_inverters: {
        // Integrated batteries in garage + inverters corridors + amenity spaces
        corridorPerSf: 0.50, amenityPerSf: 1.25, garagePerSf: 0,    batteryGarage: true,
      },
      inverters: {
        // Inverters everywhere
        corridorPerSf: 0.50, amenityPerSf: 1.25, garagePerSf: 0.25, batteryGarage: false,
      },
    },
    // Flat $/SF for the "frogeyes everywhere" strategy — editable in master pricing
    frogeyesPerSf: 0.17,
    // Garage integrated battery backup fixtures
    batteryGarage: {
      sfPerFixture:   625,  // 1 fixture per 625 SF
      fixtureEvery:     2,  // every other fixture gets a battery (÷2)
      costPerFixture: 120,  // $120 per battery-integrated fixture
    },
  },

  // ─── EXIT SIGNS ──────────────────────────────────────────────────────────
  exitSigns: {
    perSf:                  0.025,   // 2.5% of total gross SF
    largeProjectThreshold: 300000,   // above this, divide result by 2
  },

  // ─── BOH / GARAGE ─────────────────────────────────────────────────────────
  boh: {
    perSf: 1.85,
  },
  garage: {
    perSf: 0.27,
  },

  // ─── CONTROLS (COMMON AREAS) ──────────────────────────────────────────────
  // IECC 2021. Rate and hard cap by building type. Applied to total gross SF.
  controls: {
    rates: {
      singleFamily: { perSf: 0.00, cap:  50000 },
      townHouses:   { perSf: 0.00, cap:  50000 },
      stackedFlats: { perSf: 0.15, cap:  65000 },
      garden:       { perSf: 0.19, cap:  65000 },
      gurban:       { perSf: 0.22, cap:  70000 },
      wrap:         { perSf: 0.35, cap: 110000 },
      podium:       { perSf: 0.40, cap: 135000 },
      midRise:      { perSf: 0.45, cap: 175000 },
      highRise:     { perSf: 0.50, cap: 190000 },
    },
    energyCreditAdderPct: 0.03, // 3% of lighting product subtotal (excl. freight/warehousing)
    cap: 180000, // controls never exceed $180K regardless of SF (per sheet: over ~300K SF, reduce)
  },

  // ─── FREIGHT & WAREHOUSING ────────────────────────────────────────────────
  freight:     0.06, // 6% of product subtotal
  warehousing: 0.03, // 3% of product subtotal

  // ─── DESIGN BUDGET UNIT UPGRADES ─────────────────────────────────────────
  designUpgrades: {
    diskBacklitRoundedPerSf: -0.04, // rounded backlit disk vs flat edge-lit: -$0.04/SF of units
    diskSevenInch:             4,   // $4/unit to upgrade from 5" to 7" flat disk
    entryway12inch:           25,   // $25/unit for 12" entryway disk
    entryDecorative:          30,   // $30/unit for decorative surface mount entry
    dimmerCostEach:           25,   // $25 per dimmer per unit
    boilerRoomDisk:           15,   // $15/unit for boiler room disk w/ occ sensor
    fanSize52Adder:            0,   // 52" is no upcharge over 48" (per Mike)
    livingRoom4Disks:         34,   // $34/unit adder when (4) small disks chosen over (1) 12" in living room
    closetOccSensor:           0,   // same cost as switch — info only
  },

  // ─── DESIGN BUDGET FAN LEVEL PRICING ────────────────────────────────────
  // Per-fan NET adder (fan product minus $30 disk credit already in base $0.38/SF)
  designFanLevels: {
    low:    142, // $115 pull-chain fan - $30 disk credit = $85... but spreadsheet shows $142
    medium: 190, // eLuma fan $175 total - $30 disk credit = $145... spreadsheet $190
    high:   270, // custom $300 - $30 credit = $270
  },

  // ─── DESIGN BUDGET GARAGE ────────────────────────────────────────────────
  designGarage: {
    baseMediumPerSf:         0.20, // 'standard' — eLuma garage fixture (per Link+Pin sheet)
    baseHighPerSf:           0.25, // 'enhanced' — higher-end (per Link+Pin sheet)
    occSensorAdderPerSf:     0.02, // integrated occupancy sensor (legacy key)
    batteryAdderPerSf:       0.05, // integrated battery backup every other fixture (legacy)
    batteryAndSensorPerSf:   0.06, // integrated battery + occupancy sensor (legacy)
    daylightingAdderPerSf:   0.10, // occupancy + daylight harvesting sensors
  },

  // ─── DESIGN BUDGET CORRIDOR UPGRADES ─────────────────────────────────────
  designCorridors: {
    // Disk spacing $/SF lookup (from spreadsheet Price data)
    diskSpacingRates: { 6: 0.40, 7: 0.35, 8: 0.30, 9: 0.28, 10: 0.25, 11: 0.23, 12: 0.23 },
    // Recessed downlight spacing $/SF lookup
    recessedSpacingRates: { 6: 3.00, 7: 2.625, 8: 2.25, 9: 2.10, 10: 1.875, 11: 1.725, 12: 1.725 },
    // Recessed accent downlights
    accentDownlightEach: 120,       // $120/ea for fire-rated adj. downlight
    // Stairwell elevated design adder (above code minimum)
    stairwellElevatedAdder: 50,     // flat $ per landing above code minimum
    elevatedAdderPerSf: 0.25,       // legacy — kept for backward compat
  },

  // ─── DESIGN BUDGET EXIT SIGNS ─────────────────────────────────────────────
  designExitSigns: {
    thermoplasticPerSign: 22,   // $22/sign — thermoplastic (code baseline)
    mixedPerSign:         75,   // blended avg: edge-lit in FOH ($118), thermo in BOH/garage ($22)
    edgelitPerSign:      120,   // edge-lit everywhere — split of $118 (sheet) / $127 (prior), rounded
    sfPerSign:          5000,   // approx 1 sign per 5,000 gross SF
  },
};

/**
 * Human-readable labels for questionnaire option keys.
 */
export const OPTION_LABELS = {
  undercabinet: {
    none:        'None',
    lineVoltage: '120V Line Voltage (compact profile, integral power supply)',
    lowVoltage:  'Low Voltage LED Tape (slim profile, remote driver required)',
  },
  kitchenPendants: {
    none:             'None',
    threeSmallLow:    '(3) Small Pendants — Low Finish ($40 ea)',
    threeSmallMedium: '(3) Small Pendants — Medium Finish ($100 ea)',
    twoMediumLow:     '(2) Medium Pendants — Low Finish ($88 ea)',
    twoMediumMedium:  '(2) Medium Pendants — Medium Finish ($165 ea)',
    oneLarge:         '(1) Large Pendant ($275)',
    oneLinear:        '(1) Linear Pendant ($242)',
  },
  fans: {
    none:                          'No ceiling fans',
    masterOnly:                    'Master Bedroom only',
    livingRoomOnly:                'Living Room only',
    masterAndLiving:               'Master Bedroom + Living Room',
    masterAndSecondary:            'Master Bedroom + Secondary Bedroom',
    masterSecondaryLiving:         'Master Bed / Secondary Bed / Living Room',
    masterSecondaryTertiary:       'Master Bed / Secondary Bed / Tertiary Bed',
    masterSecondaryTertiaryLiving: 'Master / Secondary / Tertiary Bed + Living Room',
  },
  vanity: {
    bathBarLow:              'LED Bath Bar — Low (included in base budget)',
    illuminatedMirrorLow:    'Illuminated Mirror — Low Finish (cost-neutral)',
    illuminatedMirrorMedium: 'Illuminated Mirror — Medium Finish',
    illuminatedMirrorHigh:   'Illuminated Mirror — High Finish',
    bathBarMedium:           'LED Bath Bar — Medium Finish',
    bathBarHigh:             'LED Bath Bar — High Finish',
  },
  balcony: {
    none:         'None',
    disk5inch:    '5" Surface Mount Disk ($15)',
    sconcelow:    'Exterior Sconce — Low Finish ($55)',
    sconceMedium: 'Exterior Sconce — Medium Finish ($135)',
    sconceHigh:   'Exterior Sconce — High Finish ($240)',
  },
  corridorSconce: {
    none:       'None (no unit entry sconce)',
    low:        'Sconce — Low Finish ($55)',
    medium:     'Sconce — Medium Finish ($125)',
    high:       'Sconce — High Finish ($300)',
    integrated: 'Integrated Unit Number + Light ($200)',
  },
  interiorAmenities: {
    low:    '$6/SF — Low Finish (e.g., garden walk-up)',
    medium: '$10/SF — Medium Finish',
    high:   '$15/SF — High Finish (e.g., high-end mid-rise or high-rise)',
  },
  exteriorAmenities: {
    low:       '$1/SF — Low Finish (e.g., garden walk-up)',
    lowMedium: '$2/SF — Low-Medium Finish',
    medium:    '$3/SF — Medium Finish',
    high:      '$5/SF — High Finish (may include façade lighting)',
  },
  amenityHours: {
    beforeDusk:  'Closes at or before dusk',
    afterSunset: 'Open after sunset / before sunrise',
  },
  emergency: {
    generator:            'Building generator covers all emergency lighting',
    frogeyes:             'Frogeyes everywhere ($0.17/SF)',
    frogeyes_inv:         'Frogeyes in corridors + inverters in amenity spaces',
    integrated_frogeyes:  'Integrated batteries in garage / frogeyes in corridors / inverters in amenity spaces',
    integrated_inverters: 'Integrated batteries in garage / inverters in corridors + amenity spaces',
    inverters:            'Central inverter system everywhere',
  },
  buildingType: {
    singleFamily: 'Single Family',
    townHouses:   'Town Houses',
    stackedFlats: 'Town House / Stacked Flats',
    garden:       'Garden (3-4 stories)',
    gurban:       'Gurban / Urban Garden',
    wrap:         'Wrap',
    podium:       'Podium',
    midRise:      'Mid Rise (5–11 Levels)',
    highRise:     'High Rise (12+ Levels)',
  },
  energyCredit: {
    no:  'No — standard code-compliant LPDs',
    yes: 'Yes — targeting better-than-code LPDs (energy credit)',
  },
};
