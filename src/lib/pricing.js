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
  // Net adder per fan = conceptualPerFan gross − $35 disk credit already in
  // base. These are the DEFAULTS the master pricing sheet starts from; the
  // live figure is the /admin/pricing row (SystemConfig 'pricing'), which
  // every budget reads. Mike 2026-09-16: "There shouldn't be a coded price
  // for fans. It should always pull from the master pricing sheet."
  fans: {
    adderPerFan: 145, // net adder per fan location (legacy fallback, old frozen sheets only)
    diskCredit:   35, // credit for 12" disk removed from base
    totalPerFan: 180, // legacy gross product cost per fan (shown on the sheet; the engine does not read it)
    // What a CONCEPTUAL budget prices a fan at, GROSS, before a finish level is
    // picked. Was $180 (Mike 2026-09-05); Mike 2026-09-16, reconciling Lone
    // Tree against his own sheet: "keep $175 for fans on the gross number for
    // the master pricing sheet." The engine takes the disk credit off it, the
    // same way it does for a design fan level: $175 − $35 = $140 net per fan.
    conceptualPerFan: 175,
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
    disk5inch:    { product: 14,  labor: 0 }, // 5" disk, $14 per balcony when chosen (Mike 10-15); labor = other disks
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
    // Mike 2026-09-16: corridors are "a very typical % range of the overall
    // gross SF", so like BOH they get a cap. It only TRIMS a printed corridor
    // figure that lands above it (a "CORRIDORS & STAIRS & AMENITY" line, say)
    // — it never rounds a smaller printed figure up. The no-drawings share per
    // building type lives in intake/noDrawingGuesses.js (corridorPctOfGross).
    maxPctOfGross: 0.15,
    stairwellPerLanding: {
      product: 200,              // 4ft LED strip w/ occupancy sensor + integrated battery backup
      labor:   0,                // $175 → $200 (Mike 2026-09-14: "We have seen a cost increase")
    },
    // Breezeway walk-ups (garden / stacked flats / gurban) price each landing
    // at a multiple of the stairwell rate, by breezeway style (Mike 2026-09-14):
    //   Small (like Lowell + I76): EM disk at the ground floor, a wall pack up
    //     each flight, a 7" disk + frogeye at the 2nd-floor landing, a 7" disk
    //     at the open landing — "a 10-15% increase". 1.125 × $200 = $225.
    //   Long (like Lone Tree Ranch): 2 wall packs over long stairs, 4 disks
    //     along the open corridor above, 2 of them with integrated EM — "a
    //     20-25% increase". 1.225 × $200 = $245.
    // These replaced the flat 2.2× (2026-09-12), which ran budgets high.
    breezewaySmallMultiplier: 1.125,
    breezewayLongMultiplier:  1.225,
  },

  // ─── BREEZEWAY STAIRS (garden / stacked flats / gurban walk-ups) ──────────
  // Priced per landing at corridors.breezewaySmall/LongMultiplier (above). The
  // level defaults below only turn a landing count back into a stair count
  // for display ("≈ 25 stairs") when Project Data has no story count.
  breezewayStair: {
    storiesDefault: { garden: 3, stackedFlats: 3, gurban: 4 },
  },

  // ─── INTERIOR AMENITIES ───────────────────────────────────────────────────
  interiorAmenities: {
    low:    6,
    medium: 10,
    high:   16, // 15 → 16 (Mike 2026-09-05: "make the highest level $16 not $15")
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
    // CALIBRATION — Lowell + I76 (Mike, 2026-08-12): ~430 surface stalls.
    // ILC's first gut guess was 80 area lights; the project landed at 45–50.
    // This model predicts ceil(430 ÷ 9) = 48 — inside the landed range.
    // Mike: "Wow we figured out that math well." Wired into calculations.js
    // and shown on the Exterior step of both questionnaires.
    surfaceParking: {
      perFixture:      1325, // cost per area light + 30ft pole
      stallsPerFixture:   9, // approx 1 fixture covers 9 stalls
      // Private drive (townhouse / single-family road): one area light per the
      // width of 9 stalls, 9 × 9 ft (Mike 2026-09-13: "correlate it to the
      // width of 9 spaces ... and measure the drive").
      driveLaneFtPerLight: 81,
      // No stall count typed (blank, not 0) on a type that parks outside:
      // stalls = units × this ratio (Mike 2026-10-15, Eastchase landed at
      // 85 poles / 765 stalls for 324 garden units, about 2.4 per unit).
      // Typed 0 still means zero. Other types stay 0 when blank.
      defaultStallsPerUnit: { singleFamily: 0.5, townHouses: 0.5, garden: 2, wrap: 0.5 },
    },

    // Solar site lighting costs more than conventional because the fixture
    // carries its own panel, battery and controller. This is a MULTIPLIER on the
    // conventional rate, not a flat adder — it replaces the old
    // `surfaceParking.solarUpgrade = 3000`, which was a flat $3,000 that was
    // never wired to anything and did not scale with fixture type.
    //
    // The Avilla actuals it is blended from:
    //   solar area light $2,169.86–$2,297.57 + $1,030.52 pole  vs  $1,325
    //     conventional  →  2.4–2.5x
    //   solar bollard   $1,224.78                              vs  $800
    //     conventional  →  1.53x
    // Mike set 2.3 (2026-08-09) as a blend leaning toward area lights, and
    // confirmed 2.3 stays (2026-09-04, after the Fulshear review).
    //
    // WIRED 2026-09-04: calculations.js multiplies the surface-parking (area
    // lighting) line by this when siteDesignLevel === 'solar'. The budget also
    // carries a note that install labor drops dramatically — no trenching,
    // conduit, or wire runs to the poles.
    solarMultiplier: 2.3,

    bollard: {
      perUnit: 800,
    },

    // Townhome / single-family walking paths (Mike 2026-10-02): "bollards /
    // pedestrian poles", one every 40 ft so each light sits mid-run, $1,000
    // each (the average of a bollard and a pedestrian pole). The walkway length
    // is read off the site plan, never asked. None read: 1 per 8 homes (Mike
    // 10-2; 890 Fremont, his sheet: 25 bollards on 293 homes = 0.085).
    pedestrianPole: {
      each: 1000,
      ftPerPole: 40,
      perHome: 0.125,
    },

    // ─── BUILDING WALLPACKS ─────────────────────────────────────────────────
    // WIRED into calculations.js 2026-08-12 (Mike: "Wire it but give us a manual
    // override of quantity and unit price"). Overrides live on the wizard's
    // Exterior step as exterior.wallpacksQty / exterior.wallpacksPrice.
    //
    // Mike, 2026-08-12. Wallpacks are mounted on BUILDINGS, so they are counted
    // per building, not per unit. Counting them per unit was the source of the
    // confusion: a small townhome project and a large one carry the same 5
    // clubhouse fixtures, so dividing by units made the small project look three
    // times more expensive for identical scope.
    //
    //   wallpacks = (buildings × perBuilding) + clubhouse
    //   dollars   = wallpacks × perFixture
    //
    // Mike's field figures, which these encode:
    //   • garden walk-up: ~4 per building; a 15-building project = 60 = $21,000
    //   • wrap / podium / high-rise: ~15 for the project (10–20 on a podium)
    //   • townhomes: 5, on the clubhouse only — nothing on the residences
    // Top to bottom that is roughly $1,750 to $21,000. Mike: "not a huge
    // discrepancy when you are talking hundreds of thousands of dollars" — so
    // this is deliberately a coarse model, not a fixture-by-fixture count.
    //
    // CROSS-CHECK against the 21 real budgets: 4 wallpacks on a 12-unit walk-up
    // building is 0.333 per unit. The measured walk-up median is 0.402 per unit.
    // Mike's field estimate and the actual budgets agree within about 20%.
    //
    // CALIBRATION — Lowell + I76 (Mike, 2026-08-12): ILC's conceptual guess on
    // the 5600 Lowell site plan (7 buildings, 300 units, garden walk-up) was
    // 34 wallpacks, plus 80 area lights and 10 bollards near the exterior
    // amenity spaces. This model predicts 7 × 4 + 5 (clubhouse) = 33 — a
    // near-exact match to the human guess. (Avalon Arvada's DESIGN-SET actual
    // of 216 is a separate data point from the extracted budgets; its original
    // conceptual guess is unknown.)
    wallpacks: {
      // One rate for every building wallpack. Mike priced all 60 in his garden
      // example at this figure, so the egress-rated fixture and the plain one
      // are not split here. `exteriorDoor.wallpackWithBattery` is the same $350.
      perFixture: 350,

      // Wallpacks on EACH residential building.
      perBuilding: {
        // Horizontal products: nothing on the residences themselves, the
        // clubhouse carries it all (see `clubhouse` below).
        singleFamily: 0,
        townHouses:   0,
        // Walk-up family: separate buildings, each with its own exterior doors.
        stackedFlats: 4,
        garden:       4,
        gurban:       4,   // Mike: gurban is a garden walk-up in every way but
                           // corridors and elevators — see `elevatorShaft`
        // Vertical products: one building, so "per building" IS the project total.
        wrap:         15,
        podium:       15,  // Mike's range was 10–20
        midRise:      15,
        highRise:     15,
      },

      // A standalone clubhouse building, which only the horizontal products have
      // (on a wrap or podium the clubhouse is inside the main building and is
      // already covered by its 15). Mike 2026-08-12: "Do 5."
      clubhouse: 5,

      // Fallback ONLY. Used to estimate the building count when # of Buildings
      // has not been entered on the project. Mike 2026-08-12: "There is never a
      // 33 bldg garden project, they just have more entrances in a building or
      // two sides. so 8 units each floor." — 3 floors × 8 units = 24 per
      // building. (The Lowell site plan runs even bigger: 36–48 per building.)
      unitsPerBuilding: {
        stackedFlats: 24,
        garden:       24,
        gurban:       24,
      },
    },

    pathway: {
      // Floor for sites with a minimal walkway network. Mike, 2026-07-18:
      // "small amount… for now enter $4000."
      minTotal: 4000,

      // Solar site design multiplies the pathway line too — a solar bollard
      // ($1,224.78 on the Avilla actuals) runs ~1.53× a conventional one
      // ($800). Mike 2026-09-04: "yes pathway should get a bump of 1.6x".
      // Applied to the MODEL line only when siteDesignLevel === 'solar'; a
      // hand-entered pathway figure is taken as-is (already counted/priced).
      // Surface parking keeps its own exterior.solarMultiplier (2.3).
      solarMultiplier: 1.6,

      // ── PATHWAY DOLLARS PER UNIT, BY BUILDING TYPE ───────────────────────
      // WIRED into calculations.js 2026-09-04 (Mike signed off after the
      // 2026-09-04 rate corrections below): pathway = units × rate[type],
      // floored at minTotal; a hand-entered exteriorManualItems.pathwayLighting
      // suppresses the model line so counted figures are never doubled.
      //
      // Mike, 2026-08-12: this table is now DOLLARS per unit, not bollards per
      // unit. Multiply by the unit count to get the pathway lighting line —
      // one step instead of two, and the admin screen shows a price rather than
      // a fixture count, which is what everyone actually wants to argue about.
      // Every value below is the old bollard count × $800 (`bollard.perUnit`),
      // so nothing changed in dollar terms; only the shape did.
      //
      // Derived from 16 real projects (10 multifamily conceptual budgets +
      // 6 NexMetro Avilla BTR procurement budgets).
      //
      // ⚠ MEASUREMENT MISMATCH — READ BEFORE TRUSTING THE OBSERVED NUMBERS.
      // The multifamily figures come from CONCEPTUAL budgets (an up-front
      // estimate of 6–30 bollards). The BTR figures come from PROCUREMENT
      // budgets priced off completed photometric plans (actual counted
      // fixtures). Estimates vs actuals is not a like-for-like comparison, and
      // the gap is suspiciously large — so the multifamily observations may
      // reflect UNDER-ESTIMATION at concept stage rather than true scope.
      // Mike's field judgment (2026-07-19) contradicts the raw multifamily
      // numbers directly, and takes precedence over them here:
      //   • garden runs more like townhomes than like podium or wrap
      //   • wrap can carry surface parking, so it can run high too
      //   • podium / mid-rise / high-rise have the LEAST site lighting
      //
      // The ordering below follows that judgment. Only the townhome tier is
      // grounded in actuals; the rest are Mike's relative ranking, anchored
      // loosely to the (suspect) conceptual data. All are PROVISIONAL.
      //
      // Observed for reference — conceptual budgets, n in brackets:
      //   garden [4] 0.037–0.089   wrap [2] 0.018–0.085 (the 5x spread is
      //   consistent with surface parking being present or not)
      //   podium [1] 0.025   highRise [1] 0.045
      //
      // NEXMETRO ADJUSTMENT: 6 Avilla projects median 0.517 bollards/unit, but
      // NexMetro runs ~30% heavier than typical BTR, so the townhome rate is
      // 0.517 / 1.3 ≈ 0.40, not the raw value. Raw: 0.157 / 0.385 / 0.399 /
      // 0.517 / 0.582 / 0.638.
      //
      // Echo Trail (the only non-NexMetro townhome) recorded ZERO pathway
      // bollards. Mike: "that was a really weird project." Excluded from
      // calibration; it also distorts every density fit it appears in.
      dollarsPerUnit: {
        // ── Tier 1: horizontal product, long walks to individual doors ──
        singleFamily: 320,  // 0.40 bollards/unit — grounded in BTR actuals
        townHouses:   320,  // 0.40 — n=6 actuals, de-escalated 30%
        // Mike 2026-09-04: garden $240 → $60. His own conceptual budgets put
        // garden at 0.037–0.089 bollards/unit ($30–$71); the July deep read
        // showed garden walk-ups light walkways FROM the buildings (Avalon:
        // 0.56 wallpacks/unit, near-zero ground) and wallpacks are already
        // priced off the exit-door count — so a high ground rate here was
        // double-counting scope. $60 keeps a 300-unit garden at $18K, inside
        // the historical $5–24K band ($240 would have said $72K).
        stackedFlats: 60,   // NO DATA of its own; matches garden per Mike 2026-08-09 (re-confirmed 2026-09-04)
        garden:       60,
        // Mike 2026-08-12: "They are the same thing" — gurban carries the SAME
        // pathway rate as garden. Kept as its own field because gurban is a real
        // building type everywhere else in the app (4–5 levels, its own controls
        // rate); only the pathway number is shared.
        gurban:       60,
        // ── Tier 2: can carry surface parking, so varies widely ──
        // Mike 2026-09-04: "$96 seems high … closer to $60." $60 = 0.075
        // bollards/unit, the top of the observed conceptual band (0.018–0.085),
        // so the number now sits ON the data instead of above it. Still the
        // thinnest tier — the one deep-read wrap actual came in at 0.34
        // combined ground fixtures/unit, so revisit if wraps start landing low.
        wrap:          60,
        // ── Tier 3: structured parking, interior circulation, least site lighting ──
        // Mike 2026-07-21: keep podium / mid-rise / high-rise as SEPARATE fields
        // but with the SAME number for now. 0.06 ground fixtures/unit is the
        // median of five procurement actuals (Clermont 0.108, 95 Lincoln 0.000,
        // West Middle Creek 0.060, 38th+Huron 0.077, 40th+Walnut 0.062) —
        // ~$48–80/unit at conventional rates. On these products most site
        // lighting is building-mounted (wallpacks/steplights), not ground.
        // Mike 2026-09-04: cut $48 → $35 — these products carry HIGH unit
        // counts, so a per-unit rate over-scales (Modera Town Lake actual was
        // ~$33/unit, the low end of the $33–$81 observed high-rise band).
        podium:        35,
        midRise:       35,
        highRise:      35,
      },
    },
    // "Upgraded landscape and/or path lighting" (Mike 10-2): multiplies the
    // landscape and path lighting lines. Placeholder until Mike sets it.
    upgradedMultiplier: 1.25,
    landscape: {
      // NET lot: (lotSf − buildingFootprintSf) × $0.02 PER SQUARE FOOT. Wired
      // to the net figure 2026-09-04 (Mike: "net lot") — before that the
      // engine multiplied the FULL lot despite this key's name. Falls back to
      // the full lot when no footprint is on file. The key name says "pct"
      // for history's sake; it is a $/SF rate (Mike 2026-09-05: label it
      // "$ per SF of net lot", not a percentage).
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
      sconcePerDoor: 80,   // retired 10-2; kept so a saved sheet still loads
      // Mike 10-2: "1 strip fixture should be in each and that should be the math."
      stripPerGarage: 65,  // one LED strip inside each attached or detached garage (Mike 10-2)
    },
    // ── SITE FEATURES (Mike 2026-09-16) ──────────────────────────────────────
    // Sporadic outdoor amenities found by their printed words on the site or
    // landscape plan, each priced as its own small fixture package on its own
    // budget line. Never folded into the amenity SF, the parking area lights
    // or the carports. Absent = $0; nothing is guessed.
    //   Dog park:          1 area light at the entrance
    //   Courtyard:         one 12 ft pedestrian pole per 30 ft
    //   Playground:        two 12 ft pedestrian poles
    //   Tennis court:      4 area lights per court
    //   Pickleball court:  4 area lights per court
    //   Turf play area:    one 12 ft pedestrian pole per 50 ft
    siteFeatures: {
      areaLight:      1400, // $ each
      pedestrianPole: 2000, // $ each, 12 ft pole
      dogPark:         { areaLights: 1 },
      playground:      { pedestrianPoles: 2, packageEach: 3000 }, // $ per dog park / playground (Mike 10-14)
      tennisCourt:     { areaLights: 4 },
      pickleballCourt: { areaLights: 4 },
      courtyard:       { pedestrianPoles: 2 }, // per courtyard, count only (Mike 10-14)
      turfPlay:        { ftPerPole: 50 },
    },
    // ── SUPERSEDED, no longer wired ─────────────────────────────────────────
    // The exterior-door sconce line (doors × avg of primary+secondary) was
    // DELETED from the engine 2026-08-12. Mike, confirming the door sconces
    // and the building wallpacks are the same fixture: "These are the same,
    // so we need to use what we figured out today and delete the old one."
    // The `wallpacks` block above is now the only exterior-door fixture line.
    // Fields kept (not deleted) so historical pricing snapshots and admin
    // overrides that reference these keys don't break.
    exteriorDoor: {
      primarySconce:   350,
      secondarySconce: 75,
      // Mike 2026-08-12: "a unit price of $350 with integrated battery.
      // Typically needed for egress paths." Same figure as wallpacks.perFixture.
      // The door-count-driven refinement (floor-1 egress doors + 10%) will feed
      // the WALLPACK quantity once drawing parsing lands — not a separate line.
      wallpackWithBattery: 350,
      egressUpliftPct:     0.10,
    },
    miscBufferPct: 0.05, // 5% of exterior subtotal before misc
  },

  // ─── EMERGENCY / EGRESS LIGHTING ─────────────────────────────────────────
  // $/SF rates per space type per strategy
  // ─── ELEVATOR SHAFT VAPORTIGHT ────────────────────────────────────────────
  // COUNT ONLY — never add dollars to a budget from this block. Mike,
  // 2026-08-12: "The elevator shaft part we don't need to wire in, because
  // it's caught in the $/SF for BOH." The BOH / Core+Shell $/SF rate already
  // carries this fixture's cost; pricing it here too would double-charge it.
  //
  // What this block IS for: the fixture count. Mike: "We should have a basic
  // count calculated of them. Eventually I want to have a count of all
  // fixtures from our budget."
  //
  // The count is per SHAFT, per floor — Mike, correcting his earlier "2 per
  // floor": "It's 1 per elevator shaft, but every shaft needs it. You could
  // have 2 elevators next to each other and in turn need 2 per floor."
  //
  //   fixtures = shafts × floors × perShaftPerFloor
  //
  // perFixture ($200, set by Mike 2026-08-12) is the reference price of the
  // fixture — kept for the eventual fixture-count/takeoff view, not for the
  // budget total. Shaft count will come from drawing parsing (shafts are easy
  // to spot on floor plans).
  elevatorShaft: {
    perShaftPerFloor: 1,   // 1 vaportight w/ integrated battery per shaft per floor
    perFixture:       200, // reference price ONLY — dollars live in the BOH $/SF
  },

  emergency: {
    // Mike 10-2: every choice needs its own cost. Only the two "Integrated
    // batteries in garage" strategies back the garage up with batteryGarage
    // below; the others light the garage with their own corridor device at the
    // corridor $/SF. The math lives in src/lib/emergencyCost.js and keys off
    // the strategy NAME (frozen project snapshots still carry the old flags).
    // Mike 10-16 (Option 2): the non-integrated choices price the garage by
    // drive-aisle LENGTH: garage SF / aisle width (60 ft, Mike 10-16) = feet of
    // aisle, one frogeye every 25 ft at $25 each (garageAisle below). A
    // 156,000 SF garage = 2,600 ft = 104 frogeyes = $2,600, not $26,520.
    strategies: {
      generator: {
        corridorPerSf: 0,    amenityPerSf: 0,    garagePerSf: 0,    batteryGarage: false,
      },
      frogeyes: {
        // Flat rate in corridors + amenity — driven by emergency.frogeyesPerSf (the editable knob)
        corridorPerSf: 0.17, amenityPerSf: 0.17, garagePerSf: 0,    batteryGarage: true,
      },
      frogeyes_inv: {
        // Frogeyes in corridors + inverters in amenities
        corridorPerSf: 0.15, amenityPerSf: 1.50, garagePerSf: 0,    batteryGarage: true,
      },
      integrated_frogeyes: {
        // Integrated batteries in garage + frogeyes corridors + inverters amenity
        corridorPerSf: 0.15, amenityPerSf: 1.50, garagePerSf: 0,    batteryGarage: true,
      },
      integrated_inverters: {
        // Integrated batteries in garage + inverters corridors + amenity spaces
        corridorPerSf: 0.50, amenityPerSf: 1.50, garagePerSf: 0,    batteryGarage: true,
      },
      inverters: {
        // Inverters in corridors + amenity; the garage gets integrated batteries
        corridorPerSf: 0.50, amenityPerSf: 1.50, garagePerSf: 0,    batteryGarage: true,
      },
    },
    // Flat $/SF for the "frogeyes everywhere" strategy — editable in master pricing
    frogeyesPerSf: 0.17,
    // Garage on the non-integrated choices (Mike 10-16, Option 2): frogeyes
    // along the drive aisles. Garage SF / aisleWidthFt = feet of aisle,
    // one frogeye every spacingFt, costEach per frogeye. Generator stays $0.
    garageAisle: {
      aisleWidthFt: 60,   // garage SF / 60 = running feet of drive aisle (Mike 10-16: 60 ft)
      spacingFt:    25,   // one frogeye every 25 ft of aisle
      costEach:     25,   // $25 per frogeye
    },
    // Garage integrated battery backup fixtures
    batteryGarage: {
      sfPerFixture:   625,  // 1 fixture per 625 SF
      fixtureEvery:     2,  // every other fixture gets a battery (÷2)
      costPerFixture: 120,  // $120 per battery-integrated fixture
    },
  },

  // ─── EXIT SIGNS ──────────────────────────────────────────────────────────
  exitSigns: {
    perSf: 0.025,   // flat $0.025 per gross SF, no large-project halving (10-15)
  },

  // ─── BOH / GARAGE ─────────────────────────────────────────────────────────
  boh: {
    perSf: 1.85,
    // Mike, 2026-09-04 (Fulshear review): "BOH should never be more than 5%
    // of the Gross SF. That is the cap." Guards against BOH-as-remainder
    // swallowing corridors/walls when corridor SF is unknown (Fulshear's
    // remainder hit 63,953 SF ≈ 15.6% of gross and overpriced BOH by ~$97K).
    maxPctOfGross: 0.05,
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
      garden:       { perSf: 0.18, cap:  65000 }, // 0.19 → 0.18 (Mike 2026-09-05: "split the difference", cap stays)
      gurban:       { perSf: 0.22, cap:  70000 },
      wrap:         { perSf: 0.35, cap: 110000 },
      podium:       { perSf: 0.40, cap: 135000 },
      midRise:      { perSf: 0.45, cap: 175000 },
      highRise:     { perSf: 0.50, cap: 190000 },
    },
    energyCreditAdderPct: 0.03, // fallback: 3% added to BOTH sides for an old yes-only answer or a program missing below
    // Mike 10-15: each program carries its own adder PER SIDE. LEED and NGBS
    // add 3% to lighting and 3% to controls; WELL adds 10% to lighting and 30%
    // to controls. A plain number here still works (same % on both sides).
    energyCreditPrograms: {
      leed:  { lighting: 0.03, controls: 0.03 },
      ngbs:  { lighting: 0.03, controls: 0.03 },
      well:  { lighting: 0.10, controls: 0.30 },
      other: { lighting: 0.03, controls: 0.03 },
    },
    // Garage controls (Mike 10-15, confirmed 10-16 "Option A"): the type $/SF
    // prices the building WITHOUT its garage; the garage is priced on its own
    // SF at this rate, never under minDollars or over maxDollars, and the sum
    // still sits under the type cap. Shown as ONE controls number;
    // controlsGarage is exported for the words. Math: src/lib/controlsMath.js.
    garage: { perSf: 0.035, minDollars: 2000, maxDollars: 10000 },
    cap: 190000, // controls never exceed $190K regardless of SF (Mike 2026-09-24; was $180K)
    // Clubhouse-only controls for the types whose $/SF rate above is $0
    // (town houses, single family). Mike 2026-09-15: "Charge $5/SF and make
    // that editable in master pricing. We will adjust later." Applied to the
    // clubhouse / interior-amenity SF only, never to the homes; a community
    // with no clubhouse still gets $0 controls.
    clubhousePerSf: 5.00,
  },

  // ─── FREIGHT & WAREHOUSING ────────────────────────────────────────────────
  freight:     0.06, // 6% of product subtotal
  warehousing: 0.03, // 3% of product subtotal

  // ─── TAKEOFF ESTIMATION FACTORS ──────────────────────────────────────────
  estimation: {
    unitsToGross: 1.25, // last-resort gross SF = residential unit SF × this (Mike, 2026-09-04)
    // Stair landings (see src/lib/stairLandings.js). Mike 2026-09-05: "add 10%
    // to landings" on any count the app derives; the code-minimum fallback
    // (≥2 exit stairs per building, more on a long floor plate) fills in when
    // the drawings never state the exit-stair count. The plate factors were
    // calibrated 2026-09-05 against six real projects on file: corridor
    // buildings (wrap/podium/mid/high-rise) ran ~12K–22K SF per stair, and
    // garden/breezeway walk-ups ~5K SF per stair — each open breezeway stair
    // serves only the handful of units around it.
    landingsContingency:          0.10,
    exitStairsMinPerBuilding:     2,
    floorPlateSfPerExitStair:     15000,
    breezewayPlateSfPerExitStair: 5000,
    // No footprint and no stair count on a breezeway walk-up (a typed-in
    // budget): stairs ≈ units ÷ this. Real gardens on file (2026-09-12) ran
    // ~12–20 units per open stair; the 2-per-building code minimum gave 11
    // landings where real jobs had 81–144.
    breezewayUnitsPerStair:       15,
  },

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

  // ─── INSTALL LABOR (estimate only — never added to any budget total) ──────
  // RAW electrician labor per fixture, no 20% OH&P (Mike 2026-09-13: "Without
  // to be conservative"). Source: the ILC labor cheat sheet (Google Sheet
  // 14InNdKBej69m9Gzq-1AiCZKVb-dQMXYfSzF11CZGlJk). Excludes the fixture itself.
  // Shown next to each answer as "estimated labor + materials" so a client can
  // see the whole cost of a choice. $/SF lines (corridor disks, amenities, BOH,
  // garage) carry no labor figure (Mike: "Leave labor off of those").
  labor: {
    sconce:             72.46,  // wall sconce / frogeye / wallpack / bath bar
    surfaceDisk:        98.56,
    recessedDownlight:  98.56,
    canless:           105.33,
    strip4ft:           56.62,  // stair landing strip
    garageFixture:     234.64,
    exitSign:          101.69,
    ceilingFan:        225,
    areaPole:          869.79,  // area light + pole base
    trenchingPerFt:     15,     // trenching + conduit, per foot, wired sites (Mike 2026-09-14: "Price per foot")
    trenchFtPerPole:    60,     // average run per pole → $900/pole (Mike 2026-09-14: "$900 per average 60ft")
    solarPoleCreditPct: 0.70,   // solar site: 70% of a wired pole's labor credited back (Mike 2026-09-13)
    bollard:           384.35,
    pathwayFixture:    500,     // walking-path light (Mike 2026-09-13: "$500/fixture")
    landscapeBullet:   319.36,
    pendant:           104.36,
    stepLight:          64.97,
    tapePerFt:          14.54,  // low-voltage tape, per foot
    undercabinet24in:   57.63,  // 120V undercabinet, per 24" piece
    linear4ft:         130.31,
    troffer:            80.43,
    floorUplight:       98.56,
    switch:             49,
    receptacle:         72.56,
    emergencyCircuit:  200.76,
    fanJBox:           100.04,
    mirrorJBox:         86.05,  // lighted mirror j-box
    undercabinetFtPerUnit: 5,   // average feet of undercabinet per kitchen (Mike 2026-09-13)
    frogeyeFtEach:        25,   // 1 frogeye per 25 ft of corridor (Mike 2026-09-13)
    corridorWidthFt:       6,   // turns corridor SF into feet of corridor
    frogeyeSfEach:        300,  // amenity rooms: 1 frogeye per 300 SF (assumed)
  },
};

/**
 * Human-readable labels for questionnaire option keys.
 */
export const OPTION_LABELS = {
  undercabinet: {
    none:        'None',
    lineVoltage: '120v (compact profile, integral power supply)',
    lowVoltage:  'Low voltage (slim profile, remote driver required)',
  },
  kitchenPendants: {
    none:             'None',
    threeSmallLow:    '3 small pendants (Low finish) ($40 ea)',
    threeSmallMedium: '3 small pendants (Medium finish) ($100 ea)',
    twoMediumLow:     '2 medium pendants (Low finish) ($88 ea)',
    twoMediumMedium:  '2 medium pendants (Medium finish) ($165 ea)',
    oneLarge:         '1 large pendant ($275)',
    oneLinear:        '1 linear pendant ($242)',
  },
  fans: {
    none:                          'None',
    masterOnly:                    'Master bed only',
    livingRoomOnly:                'Living room only',
    masterAndLiving:               'Master bed + Living room',
    masterAndSecondary:            'Master bed + Secondary bed',
    masterSecondaryLiving:         'Master bed/Secondary bed/Living room',
    masterSecondaryTertiary:       'Master bed/Secondary bed/Tertiary bed',
    masterSecondaryTertiaryLiving: 'Master bed/Secondary bed/Tertiary bed + Living room',
  },
  vanity: {
    bathBarLow:              'Mirror and bath bar (Low finish) (included in base budget)',
    illuminatedMirrorLow:    'Illuminated mirror (Low finish) (cost-neutral)',
    illuminatedMirrorMedium: 'Illuminated mirror (Medium finish)',
    illuminatedMirrorHigh:   'Illuminated mirror (High finish)',
    bathBarMedium:           'Mirror and bath bar (Medium finish)',
    bathBarHigh:             'Mirror and bath bar (High finish)',
  },
  balcony: {
    none:         'None',
    disk5inch:    '5" surface mount disk ($14)',
    sconcelow:    'Exterior balcony sconce (Low finish) ($55)',
    sconceMedium: 'Exterior balcony sconce (Medium finish) ($135)',
    sconceHigh:   'Exterior balcony sconce (High finish) ($240)',
  },
  corridorSconce: {
    none:       'None (no unit entry sconce)',
    low:        '1 sconce (Low finish) ($55)',
    medium:     '1 sconce (Medium finish) ($125)',
    high:       '1 sconce (High finish) ($300)',
    integrated: '1 Integrated unit number/light ($200)',
  },
  interiorAmenities: {
    low:    '$6/SF — Low finish (e.g., garden walk-up)',
    medium: '$10/SF — Medium finish',
    high:   '$16/SF — High finish (e.g., high-end mid-rise or high-rise)',
  },
  exteriorAmenities: {
    low:       '$1/SF — Low finish (e.g., garden walk-up)',
    lowMedium: '$2/SF — Low-Medium finish',
    medium:    '$3/SF — Medium finish',
    high:      '$5/SF — High finish (may include façade lighting)',
  },
  amenityHours: {
    beforeDusk:  'Closes at or before dusk',
    afterSunset: '24hrs or after dark',
    duskToDawn:  'Dusk to Dawn',
  },
  emergency: {
    generator:            'Building generator covers all emergency lighting',
    frogeyes:             'Frogeyes everywhere',
    frogeyes_inv:         'Frogeyes in corridors + inverters in amenity spaces',
    integrated_frogeyes:  'Integrated batteries in garage / frogeyes in corridors / inverters in amenity spaces',
    integrated_inverters: 'Integrated batteries in garage / inverters in corridors + amenity spaces',
    inverters:            'Inverters everywhere',
  },
  buildingType: {
    singleFamily: 'Single Family (1-2 Levels)',
    townHouses:   'Town Houses (2-3 Levels)',
    stackedFlats: 'Town House/Stacked Flats (3 Levels)',
    garden:       'Garden (3 Levels)',
    gurban:       'Gurban (4-5 Levels)',
    wrap:         'Wrap (3-5 Levels)',
    podium:       'Podium (3-8 Levels)',
    midRise:      'Mid Rise (9-12 Levels)',
    highRise:     'High Rise (12+ Levels)',
  },
  energyCredit: {
    no:  'No — standard code-compliant LPDs',
    yes: 'Yes — targeting better-than-code LPDs (energy credit)',
  },
};
