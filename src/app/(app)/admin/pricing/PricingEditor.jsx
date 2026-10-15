'use client';
import { useState, useEffect } from 'react';
import { parseLooseNumber } from '@/lib/numberInput';
import Button from '@/components/ui/Button';

// Flat definition of every editable pricing field
// key = dot-notation path into the pricing object
const PRICING_FIELDS = [
  // ── BASE ──────────────────────────────────────────────────────────────
  { group: 'Base Unit Rate', key: 'base.perSf', label: 'Per SF Rate', desc: '$/SF of residential units gross SF', unit: '$/SF' },

  // ── UNDERCABINET ──────────────────────────────────────────────────────
  { group: 'Undercabinet Lighting', key: 'undercabinet.lineVoltage.product', label: 'Line Voltage', desc: '120V line voltage per unit', unit: '$/unit' },
  { group: 'Undercabinet Lighting', key: 'undercabinet.lowVoltage.product',  label: 'Low Voltage LED Tape', desc: 'LED tape + channel + driver per unit', unit: '$/unit' },

  // ── KITCHEN PENDANTS ──────────────────────────────────────────────────
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.threeSmallLow.product',    label: '(3) Small — Low',           desc: 'Per unit', unit: '$/unit' },
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.threeSmallMedium.product', label: '(3) Small — Medium',         desc: 'Per unit', unit: '$/unit' },
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.twoMediumLow.product',     label: '(2) Medium — Low',           desc: 'Per unit', unit: '$/unit' },
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.twoMediumMedium.product',  label: '(2) Medium — Medium',        desc: 'Per unit', unit: '$/unit' },
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.oneLarge.product',         label: '(1) Large Statement',        desc: 'Per unit', unit: '$/unit' },
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.oneLinear.product',        label: '(1) Linear over Island',     desc: 'Per unit', unit: '$/unit' },

  // ── CEILING FANS ──────────────────────────────────────────────────────
  { group: 'Ceiling Fans', key: 'fans.conceptualPerFan', label: 'Conceptual Per Fan', desc: 'GROSS price per fan on a conceptual budget, before a design fan level is picked; the $35 disk credit comes off it in the budget (Mike 2026-09-16: $175 gross → $140 net)', unit: '$/fan' },
  { group: 'Ceiling Fans', key: 'fans.adderPerFan', label: 'Net Adder Per Fan (legacy)', desc: 'Fallback only if Conceptual Per Fan is blank', unit: '$/fan' },
  { group: 'Ceiling Fans', key: 'fans.diskCredit',  label: 'Disk Credit',       desc: 'Base disk removed when fan installed', unit: '$/fan' },
  { group: 'Ceiling Fans', key: 'fans.totalPerFan', label: 'Gross Per Fan',     desc: 'Full product cost before credit', unit: '$/fan' },

  // ── VANITY LIGHTING ───────────────────────────────────────────────────
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanity.illuminatedMirrorLow.product',    label: 'Illuminated Mirror — Low',    desc: 'Gross product price', unit: '$/vanity' },
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanity.illuminatedMirrorMedium.product', label: 'Illuminated Mirror — Medium', desc: 'Gross product price', unit: '$/vanity' },
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanity.illuminatedMirrorHigh.product',   label: 'Illuminated Mirror — High',   desc: 'Gross product price', unit: '$/vanity' },
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanity.bathBarMedium.product',           label: 'Bath Bar — Medium',           desc: 'Gross product price', unit: '$/vanity' },
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanity.bathBarHigh.product',             label: 'Bath Bar — High',             desc: 'Gross product price', unit: '$/vanity' },
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanityBathBarCredit',                    label: 'Bath-Bar Credit (subtracted)', desc: 'Base $0.38/SF includes a bath bar — subtracted from every vanity upgrade', unit: '$/vanity' },

  // ── BALCONY ───────────────────────────────────────────────────────────
  { group: 'Balcony Fixtures (net adders)', key: 'balcony.sconcelow.product',    label: 'Sconce — Low',    desc: 'Upgrade adder over base disk', unit: '$/balcony' },
  { group: 'Balcony Fixtures (net adders)', key: 'balcony.sconceMedium.product', label: 'Sconce — Medium', desc: 'Upgrade adder over base disk', unit: '$/balcony' },
  { group: 'Balcony Fixtures (net adders)', key: 'balcony.sconceHigh.product',   label: 'Sconce — High',   desc: 'Upgrade adder over base disk', unit: '$/balcony' },

  // ── CORRIDORS ─────────────────────────────────────────────────────────
  { group: 'Corridors & Stairwells', key: 'corridors.diskPerSf',                       label: 'Corridor Disk Rate',       desc: '7" disk @ 10ft spacing, flat $/SF', unit: '$/SF' },
  { group: 'Corridors & Stairwells', key: 'corridors.maxPctOfGross',                   label: 'Corridor Cap (share of gross)', desc: 'Only trims a corridor / circulation figure printed on the drawings when it is above this share of the building gross SF; it never rounds a smaller figure up (Mike 2026-09-16: "a cap like BOH"). When nothing is printed, the takeoff estimates corridors at the building type\'s typical share (12% on corridor buildings, 0 on breezeway types). Typed as a fraction: 0.15 = 15%.', unit: '× gross' },
  { group: 'Corridors & Stairwells', key: 'corridors.stairwellPerLanding.product',     label: 'Stairwell Per Landing',    desc: '4ft LED strip + occupancy + battery — enclosed corridor-building stairs (wrap / podium / mid-rise / high-rise)', unit: '$/landing' },
  { group: 'Corridors & Stairwells', key: 'corridors.breezewaySmallMultiplier',       label: 'Small Breezeway Multiplier', desc: 'Garden / stacked-flat / gurban walk-ups, small breezeway (like Lowell + I76): EM disk at the ground floor, a wall pack up each flight, 7" disks + frogeye at the landings. Each landing prices at Stairwell Per Landing × this. Mike 2026-09-14: 10–15% more → 1.125 (1.125 × $200 = $225). Small vs long is picked only when drawings are on file; without them a breezeway prices at the average of this and the long multiplier (1.175 × $200 = $235).', unit: '×' },
  { group: 'Corridors & Stairwells', key: 'corridors.breezewayLongMultiplier',        label: 'Long Breezeway Multiplier',  desc: 'Long breezeway (like Lone Tree Ranch): 2 wall packs over long stairs, 4 disks along the open corridor above, 2 with EM batteries. Mike 2026-09-14: 20–25% more → 1.225 (1.225 × $200 = $245). Also half of the no-drawings average.', unit: '×' },
  { group: 'Corridors & Stairwells', key: 'breezewayStair.storiesDefault.garden',       label: 'Breezeway Levels — Garden (default)',       desc: 'Levels each stair serves when Project Data has no story count.', unit: 'levels' },
  { group: 'Corridors & Stairwells', key: 'breezewayStair.storiesDefault.stackedFlats', label: 'Breezeway Levels — Stacked Flats (default)', desc: 'Same, for stacked flats.', unit: 'levels' },
  { group: 'Corridors & Stairwells', key: 'breezewayStair.storiesDefault.gurban',       label: 'Breezeway Levels — Gurban (default)',       desc: 'Same, for gurban walk-ups.', unit: 'levels' },
  { group: 'Corridors & Stairwells', key: 'corridorSconce.low.product',                label: 'Unit Entry Sconce — Low',  desc: 'Per unit', unit: '$/unit' },
  { group: 'Corridors & Stairwells', key: 'corridorSconce.medium.product',             label: 'Unit Entry Sconce — Medium', desc: 'Per unit', unit: '$/unit' },
  { group: 'Corridors & Stairwells', key: 'corridorSconce.high.product',               label: 'Unit Entry Sconce — High', desc: 'Per unit', unit: '$/unit' },
  { group: 'Corridors & Stairwells', key: 'corridorSconce.integrated.product',         label: 'Unit Entry Integrated',    desc: 'Unit number + light per unit', unit: '$/unit' },

  // ── BOH / GARAGE ──────────────────────────────────────────────────────
  { group: 'BOH & Garage', key: 'boh.perSf',    label: 'BOH / Core + Shell Rate', desc: '$/SF of BOH area', unit: '$/SF' },
  { group: 'BOH & Garage', key: 'boh.maxPctOfGross', label: 'BOH Cap (% of Gross)', desc: 'BOH SF is never priced above this fraction of gross SF (0.05 = 5%). Mike 2026-09-04: guards against remainder-derived BOH swallowing corridors/walls.', unit: 'decimal' },
  { group: 'BOH & Garage', key: 'garage.perSf', label: 'Enclosed Garage Rate',    desc: '$/SF of garage area', unit: '$/SF' },

  // ── INTERIOR AMENITIES ────────────────────────────────────────────────
  { group: 'Interior Amenities', key: 'interiorAmenities.low',    label: 'Low Finish',    desc: '$/SF', unit: '$/SF' },
  { group: 'Interior Amenities', key: 'interiorAmenities.medium', label: 'Medium Finish', desc: '$/SF', unit: '$/SF' },
  { group: 'Interior Amenities', key: 'interiorAmenities.high',   label: 'High Finish',   desc: '$/SF', unit: '$/SF' },

  // ── EXTERIOR AMENITIES ────────────────────────────────────────────────
  { group: 'Exterior Amenities', key: 'exteriorAmenities.low',               label: 'Low Finish',        desc: '$/SF', unit: '$/SF' },
  { group: 'Exterior Amenities', key: 'exteriorAmenities.medium',            label: 'Medium Finish',     desc: '$/SF', unit: '$/SF' },
  { group: 'Exterior Amenities', key: 'exteriorAmenities.high',              label: 'High Finish',       desc: '$/SF', unit: '$/SF' },
  { group: 'Exterior Amenities', key: 'exteriorAmenities.nighttimeMultiplier', label: 'Nighttime Multiplier', desc: 'Multiplied when open after sunset', unit: '×' },

  // ── EXTERIOR SITE ─────────────────────────────────────────────────────
  // Key was `perStall` until 2026-07-18, but nothing reads that — pricing.js defines
  // `perFixture` and both the engine and the UI preview read `perFixture`, so every
  // edit made through this field was silently discarded. Label was misleading too:
  // $1,325 buys one area light + pole covering ~9 stalls, not one stall.
  { group: 'Exterior Site', key: 'exterior.surfaceParking.perFixture',   label: 'Surface Parking — Per Fixture', desc: 'Area light + 30ft pole (covers ~9 stalls)', unit: '$/fixture' },
  { group: 'Exterior Site', key: 'exterior.surfaceParking.stallsPerFixture', label: 'Stalls Per Fixture',    desc: 'How many stalls one area light covers', unit: 'stalls' },
  { group: 'Exterior Site', key: 'exterior.surfaceParking.driveLaneFtPerLight', label: 'Drive Lane Ft Per Light', desc: 'One area light per this many feet of private drive (townhouse / single-family). 81 = the width of 9 stalls — Mike 2026-09-13', unit: 'ft' },
  { group: 'Exterior Site', key: 'exterior.upgradedMultiplier',          label: 'Upgraded Site Multiplier',  desc: 'Multiplies the landscape and path lighting lines when the site design is Upgraded landscape and/or path lighting (Mike 10-2)', unit: '×' },
  { group: 'Exterior Site', key: 'exterior.solarMultiplier',             label: 'Solar Multiplier',          desc: 'Multiplies the surface-parking (area lighting) line when the site design is Solar. From Avilla actuals — area lights run 2.4–2.5x, bollards 1.53x. Replaces the old flat $3,000 solar adder. Confirmed 2.3 by Mike 2026-09-04', unit: '×' },
  { group: 'Exterior Site', key: 'exterior.carport.diskEveryOther',      label: 'Carport Disk (every other)', desc: '7" disk per every other bay', unit: '$/disk' },
  { group: 'Exterior Site', key: 'exterior.detachedGarage.stripPerGarage', label: 'Garage Strip Per Garage',  desc: 'One LED strip in each attached or detached garage', unit: '$/garage' },
  { group: 'Exterior Site', key: 'exterior.exteriorDoor.primarySconce',  label: 'Exterior Door — Primary (retired)',   desc: 'No longer drives any budget. The door-sconce line was deleted 2026-08-12 — same fixture as Building Wallpacks below, which is now the only exterior-door line', unit: '$/door' },
  { group: 'Exterior Site', key: 'exterior.exteriorDoor.secondarySconce', label: 'Exterior Door — Secondary (retired)', desc: 'No longer drives any budget — see Building Wallpacks', unit: '$/door' },
  { group: 'Exterior Site', key: 'exterior.exteriorDoor.wallpackWithBattery', label: 'Wallpack + Battery',   desc: 'Egress wallpack w/ battery backup — $350 per Mike 2026-08-12, same figure as the Building Wallpack price. Reference only; the drawing-takeoff door count will refine the wallpack quantity, not add a separate line', unit: '$/door' },
  { group: 'Exterior Site', key: 'exterior.pedestrianPole.each',          label: 'Bollard / Pedestrian Pole $ Each', desc: 'Townhome and single-family walking paths only. Average of a bollard and a pedestrian pole (Mike 2026-10-02)', unit: '$' },
  { group: 'Exterior Site', key: 'exterior.pedestrianPole.ftPerPole',     label: 'Walkway Ft per Pole',       desc: 'One bollard / pedestrian pole every this many feet of walkway (Mike 2026-10-02: 40)', unit: 'ft' },
  { group: 'Exterior Site', key: 'exterior.pedestrianPole.perHome',       label: 'Poles per Home (no walkway length)', desc: 'Used only when the site plan gives no walkway length. 1 per 8 homes = 0.125 (Mike 2026-10-02; 890 Fremont had 25 bollards on 293 homes)', unit: '/home' },
  { group: 'Exterior Site', key: 'exterior.pathway.minTotal',            label: 'Pathway Lighting Floor',    desc: 'Minimum pathway lighting for sites with a minimal walkway network', unit: '$' },

  // ── BUILDING WALLPACKS ────────────────────────────────────────────────
  // Counted per BUILDING, not per unit. Wired into the exterior budget line
  // 2026-08-12; the wizard's Exterior step carries qty + price overrides.
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.perFixture',                label: 'Wallpack Price',              desc: 'One rate for every building wallpack, egress-rated or not. Mike 2026-08-12', unit: '$/fixture' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.clubhouse',                 label: 'Clubhouse Wallpacks',         desc: 'A standalone clubhouse building — horizontal products only. On a wrap or podium the clubhouse is inside the main building and is already covered by its count. Mike 2026-08-12: "Do 5."', unit: 'fixtures' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.perBuilding.singleFamily',  label: 'Per Building — Single Family', desc: 'Nothing on the residences; the clubhouse carries it all', unit: 'fixtures' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.perBuilding.townHouses',    label: 'Per Building — Townhouses',    desc: 'Nothing on the residences; the clubhouse carries it all. Confirmed against the real budgets — townhomes carry a flat 3–7 fixtures regardless of project size', unit: 'fixtures' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.perBuilding.stackedFlats',  label: 'Per Building — Stacked Flats', desc: 'Walk-up family — separate buildings, each with its own exterior doors', unit: 'fixtures' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.perBuilding.garden',        label: 'Per Building — Garden',        desc: 'Mike: ~4 per building; a 15-building project = 60 = $21,000. Cross-checks against the real budgets within ~20%', unit: 'fixtures' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.perBuilding.gurban',        label: 'Per Building — Gurban',        desc: 'Mike 2026-08-12: a gurban is a garden walk-up in every way but corridors and elevators', unit: 'fixtures' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.perBuilding.wrap',          label: 'Per Building — Wrap',          desc: 'One building, so this is the project total', unit: 'fixtures' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.perBuilding.podium',        label: 'Per Building — Podium',        desc: 'One building, so this is the project total. Mike\'s range was 10–20', unit: 'fixtures' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.perBuilding.midRise',       label: 'Per Building — Mid Rise',      desc: 'One building, so this is the project total', unit: 'fixtures' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.perBuilding.highRise',      label: 'Per Building — High Rise',     desc: 'One building, so this is the project total', unit: 'fixtures' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.unitsPerBuilding.stackedFlats', label: 'Units/Building — Stacked Flats', desc: 'FALLBACK ONLY — used to estimate how many buildings a project has when the building count has not been entered', unit: 'units' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.unitsPerBuilding.garden',       label: 'Units/Building — Garden',        desc: 'FALLBACK ONLY. Mike 2026-08-12: 3 floors, 8 units per floor = 24. Real # of Buildings on the project always wins over this', unit: 'units' },
  { group: 'Building Wallpacks', key: 'exterior.wallpacks.unitsPerBuilding.gurban',       label: 'Units/Building — Gurban',        desc: 'FALLBACK ONLY — same as garden', unit: 'units' },

  // ── ELEVATOR SHAFT VAPORTIGHT ─────────────────────────────────────────
  { group: 'Elevator Shaft Vaportight', key: 'elevatorShaft.perShaftPerFloor', label: 'Vaportights Per Shaft Per Floor', desc: 'Mike 2026-08-12: 1 per shaft per floor — two side-by-side elevators are two shafts, so two per floor. COUNT ONLY: the dollars are already inside the BOH $/SF rate, so this never adds to a budget total', unit: 'fixtures' },
  { group: 'Elevator Shaft Vaportight', key: 'elevatorShaft.perFixture',       label: 'Elevator Shaft Vaportight',       desc: 'Vaportight w/ integrated battery — reference price for the fixture-count view, NOT added to budgets (covered by BOH $/SF). Mike 2026-08-12: "Add $200 in that field."', unit: '$/fixture' },
  // WIRED into the engine 2026-09-04: pathway = units × rate[buildingType],
  // floored at the Pathway Lighting Floor; a manual pathway entry on the
  // wizard suppresses the model line. Rates corrected by Mike 2026-09-04.
  { group: 'Exterior Site', key: 'exterior.pathway.dollarsPerUnit.singleFamily', label: 'Pathway $/Unit — Single Family',   desc: 'TIER 1. Horizontal product, same model as BTR townhomes', unit: '$/unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.dollarsPerUnit.townHouses',   label: 'Pathway $/Unit — Townhouses',      desc: 'TIER 1. Only rate grounded in actuals — 6 NexMetro BTR photometric-priced budgets (median 0.517 bollards/unit), reduced ~30% since NexMetro runs heavier than typical BTR. Mike re-confirmed $320 on 2026-09-04', unit: '$/unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.dollarsPerUnit.stackedFlats', label: 'Pathway $/Unit — Stacked Flats',   desc: 'TIER 1. NO DATA of its own — matches Garden per Mike (2026-08-09, re-confirmed 2026-09-04)', unit: '$/unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.dollarsPerUnit.garden',       label: 'Pathway $/Unit — Garden',          desc: 'TIER 1. Mike 2026-09-04: cut $240 → $60 — garden walk-ups light walkways from the buildings (wallpacks, priced separately), and his conceptual budgets ran $30–$71/unit', unit: '$/unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.dollarsPerUnit.gurban',       label: 'Pathway $/Unit — Gurban (4–5 Lvl)', desc: 'Mike 2026-08-12: same as Garden. Kept as its own field because gurban is a separate building type elsewhere in the app; only the pathway rate is shared', unit: '$/unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.dollarsPerUnit.wrap',         label: 'Pathway $/Unit — Wrap',            desc: 'TIER 2. Mike 2026-09-04: cut $96 → $60, the top of the observed band (0.018–0.085 bollards/unit). Runs higher when surface parking is present', unit: '$/unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.dollarsPerUnit.podium',       label: 'Pathway $/Unit — Podium',          desc: 'TIER 3. Structured parking + interior circulation = least site lighting. Mike 2026-09-04: cut $48 → $35 — these products carry high unit counts, so per-unit over-scales', unit: '$/unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.dollarsPerUnit.midRise',      label: 'Pathway $/Unit — Mid Rise',        desc: 'TIER 3. Same number as Podium for now (Mike 2026-09-04: $35)', unit: '$/unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.dollarsPerUnit.highRise',     label: 'Pathway $/Unit — High Rise',       desc: 'TIER 3. Same number as Podium for now (Mike 2026-09-04: $35; Modera Town Lake actual ran ~$13/unit — the floor and manual entries handle low-site high-rises)', unit: '$/unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.solarMultiplier',     label: 'Pathway Solar Multiplier',  desc: 'Multiplies the MODEL pathway line when the site design is Solar (a solar bollard ran 1.53× conventional on the Avilla actuals). Mike 2026-09-04: 1.6. A hand-entered pathway figure is never multiplied', unit: '×' },
  { group: 'Exterior Site', key: 'exterior.landscape.pctOfNetLotSf',     label: 'Landscape $ per SF of Net Lot', desc: 'Landscape lighting in dollars per square foot of the NET lot — lot SF minus building footprint (0.02 = two cents per SF). Not a percentage. Falls back to the full lot when no footprint is on file; capped by the Landscape Cap below', unit: '$/SF' },
  { group: 'Exterior Site', key: 'exterior.landscape.maxTotal',          label: 'Landscape Cap',             desc: 'Hard ceiling on landscape lighting regardless of net lot size', unit: '$' },
  { group: 'Exterior Site', key: 'exterior.miscBufferPct',               label: 'Misc Buffer %',             desc: '% of exterior subtotal before misc', unit: '%' },

  // ── SITE FEATURES (Mike 2026-09-16) ────────────────────────────────────
  // Dog parks, courtyards, playgrounds, courts and turf play areas found by
  // their printed words on the site / landscape plan. Each is its own line
  // under Exterior & Site; never merged into the amenity SF or the parking
  // area lights. Nothing is guessed — a feature not on the drawings and not
  // typed in prices at $0.
  { group: 'Site Features', key: 'exterior.siteFeatures.areaLight',                   label: 'Area Light — Each',              desc: 'Pole-mounted area light used on tennis / pickleball courts. Mike 2026-09-16: $1,400', unit: '$' },
  { group: 'Site Features', key: 'exterior.siteFeatures.pedestrianPole',              label: '12 ft Pedestrian Pole — Each',   desc: 'Pedestrian pole used in courtyards, dog parks / playgrounds and turf play areas. Mike 2026-09-16: $2,000', unit: '$' },
  { group: 'Site Features', key: 'exterior.siteFeatures.playground.pedestrianPoles',  label: 'Dog Park / Playground — Poles Each', desc: '12 ft pedestrian poles per dog park or playground (Mike 10-14: dog parks use the playground package)', unit: 'fixtures' },
  { group: 'Site Features', key: 'exterior.siteFeatures.playground.packageEach',      label: 'Dog Park / Playground: Package Price', desc: 'Price for each dog park or playground, poles included. Mike 2026-10-14: $3,000', unit: '$' },
  { group: 'Site Features', key: 'exterior.siteFeatures.tennisCourt.areaLights',      label: 'Tennis / Pickleball Court — Area Lights Each', desc: 'Area lights per tennis or pickleball court', unit: 'fixtures' },
  { group: 'Site Features', key: 'exterior.siteFeatures.courtyard.pedestrianPoles',   label: 'Courtyard: Pedestrian Poles Each', desc: '12 ft pedestrian poles per courtyard. Courtyards are counted, never measured (Mike 10-14).', unit: 'poles' },
  { group: 'Site Features', key: 'exterior.siteFeatures.turfPlay.ftPerPole',          label: 'Turf Play — Feet per Pole',      desc: 'One 12 ft pedestrian pole per this many feet of turf play area (longest dimension)', unit: 'ft' },

  // ── EMERGENCY ─────────────────────────────────────────────────────────
  { group: 'Emergency — Frogeyes', key: 'emergency.strategies.frogeyes.corridorPerSf', label: 'Corridor $/SF', desc: '', unit: '$/SF' },
  { group: 'Emergency — Frogeyes', key: 'emergency.strategies.frogeyes.amenityPerSf',  label: 'Amenity $/SF',  desc: '', unit: '$/SF' },

  { group: 'Emergency — Frogeyes + Inverters', key: 'emergency.strategies.frogeyes_inv.corridorPerSf', label: 'Corridor $/SF', desc: '', unit: '$/SF' },
  { group: 'Emergency — Frogeyes + Inverters', key: 'emergency.strategies.frogeyes_inv.amenityPerSf',  label: 'Amenity $/SF',  desc: '', unit: '$/SF' },

  { group: 'Emergency — Integrated + Frogeyes', key: 'emergency.strategies.integrated_frogeyes.corridorPerSf', label: 'Corridor $/SF', desc: '', unit: '$/SF' },
  { group: 'Emergency — Integrated + Frogeyes', key: 'emergency.strategies.integrated_frogeyes.amenityPerSf',  label: 'Amenity $/SF',  desc: '', unit: '$/SF' },

  { group: 'Emergency — Integrated + Inverters', key: 'emergency.strategies.integrated_inverters.corridorPerSf', label: 'Corridor $/SF', desc: '', unit: '$/SF' },
  { group: 'Emergency — Integrated + Inverters', key: 'emergency.strategies.integrated_inverters.amenityPerSf',  label: 'Amenity $/SF',  desc: '', unit: '$/SF' },

  { group: 'Emergency — Inverters', key: 'emergency.strategies.inverters.corridorPerSf', label: 'Corridor $/SF', desc: '', unit: '$/SF' },
  { group: 'Emergency — Inverters', key: 'emergency.strategies.inverters.amenityPerSf',  label: 'Amenity $/SF',  desc: '', unit: '$/SF' },

  { group: 'Emergency — Battery Backup (Garage)', key: 'emergency.batteryGarage.sfPerFixture',   label: 'SF Per Fixture',     desc: '1 fixture per N SF', unit: 'SF' },
  { group: 'Emergency — Battery Backup (Garage)', key: 'emergency.batteryGarage.fixtureEvery',   label: 'Battery Every N Fixtures', desc: 'Every other = 2', unit: 'fixtures' },
  { group: 'Emergency — Battery Backup (Garage)', key: 'emergency.batteryGarage.costPerFixture', label: 'Cost Per Fixture',   desc: 'Per battery-integrated fixture. Applies to every strategy except generator whenever the project has garage SF', unit: '$/fixture' },

  // ── EXIT SIGNS ────────────────────────────────────────────────────────
  { group: 'Exit Signs', key: 'exitSigns.perSf', label: 'Rate', desc: '% of total gross SF (0.025 = 2.5%)', unit: 'decimal' },
  { group: 'Exit Signs', key: 'exitSigns.largeProjectThreshold', label: 'Large-Project Threshold', desc: 'Above this SF, halve the exit-sign cost', unit: 'SF' },

  { group: 'Exit Signs — Design Levels', key: 'designExitSigns.thermoplasticPerSign', label: 'Thermoplastic', desc: 'Code baseline sign', unit: '$/sign' },
  { group: 'Exit Signs — Design Levels', key: 'designExitSigns.mixedPerSign',         label: 'Mixed (edge-lit front, thermo back)', desc: 'Blended average across the building', unit: '$/sign' },
  { group: 'Exit Signs — Design Levels', key: 'designExitSigns.edgelitPerSign',       label: 'Edge-Lit Everywhere', desc: 'Edge-lit in every location', unit: '$/sign' },
  { group: 'Exit Signs — Design Levels', key: 'designExitSigns.sfPerSign',            label: 'SF Per Sign', desc: 'About one sign per N gross SF', unit: 'SF' },

  // ── EMERGENCY LIGHTING ────────────────────────────────────────────────
  { group: 'Emergency Lighting', key: 'emergency.frogeyesPerSf', label: 'Frogeyes — Flat Rate', desc: '"Frogeyes everywhere" strategy: flat $/SF across corridors, amenities, and garage', unit: '$/SF' },

  // ── CONTROLS (by building type — $/SF; single universal $ cap) ─────────
  { group: 'Controls — Building Type Rates', key: 'controls.rates.singleFamily.perSf', label: 'Single Family (1–2 Lvl)', unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.townHouses.perSf',   label: 'Town Houses (2–3 Lvl)',   unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.stackedFlats.perSf', label: 'Stacked Flats (3 Lvl)',   unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.garden.perSf',       label: 'Garden (3 Lvl)',          unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.gurban.perSf',       label: 'Urban (4–5 Lvl)',         unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.wrap.perSf',         label: 'Wrap (3–5 Lvl)',          unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.podium.perSf',       label: 'Podium (3–8 Lvl)',        unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.midRise.perSf',      label: 'Mid Rise (9–12 Lvl)',     unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.highRise.perSf',     label: 'High Rise (12+ Lvl)',     unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.clubhousePerSf',           label: 'Clubhouse Only (Town Houses / Single Family)', desc: 'When the building type\'s rate above is $0, controls are priced on the clubhouse / interior amenity SF alone at this rate. No clubhouse = $0 controls.', unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.cap',                      label: 'Controls Cap (max $)',    desc: 'Controls never exceed this, regardless of SF', unit: '$' },
  { group: 'Controls — Building Type Rates', key: 'controls.energyCreditAdderPct',     label: 'Energy Credit Adder',     desc: '% added to lighting + controls subtotals (0.03 = 3%)', unit: 'decimal' },

  // ── DESIGN-LEVEL PRICING ──────────────────────────────────────────────
  { group: 'Ceiling Fans — Design Levels (gross)', key: 'designFanLevels.low',    label: 'Fan (Low)',    desc: 'Gross, before disk credit', unit: '$/fan' },
  { group: 'Ceiling Fans — Design Levels (gross)', key: 'designFanLevels.medium', label: 'Fan (Medium)', desc: 'Gross, before disk credit', unit: '$/fan' },
  { group: 'Ceiling Fans — Design Levels (gross)', key: 'designFanLevels.high',   label: 'Fan (High)',   desc: 'Gross, before disk credit', unit: '$/fan' },

  { group: 'Garage — Design Levels', key: 'designGarage.baseMediumPerSf', label: 'Base (Medium)', desc: 'eLuma garage fixture', unit: '$/SF' },
  { group: 'Garage — Design Levels', key: 'designGarage.baseHighPerSf',   label: 'Base (High)',   desc: 'Higher-end linear LED', unit: '$/SF' },
  { group: 'Garage — Design Levels', key: 'designGarage.daylightingAdderPerSf', label: 'Occupancy + Daylight Sensors', desc: 'Adder on garage SF when sensors are chosen', unit: '$/SF' },

  { group: 'Corridors — Design', key: 'designCorridors.accentDownlightEach',    label: 'Recessed Accent Downlight', desc: '1-hr fire-rated, each', unit: '$/ea' },
  { group: 'Corridors — Design', key: 'designCorridors.stairwellElevatedAdder', label: 'Stairwell Elevated Adder',  desc: 'Per landing above code', unit: '$/landing' },

  { group: 'Unit Design Upgrades', key: 'designUpgrades.entryway12inch',  label: '12" Statement Entry Disk', desc: 'Per unit', unit: '$/unit' },
  { group: 'Unit Design Upgrades', key: 'designUpgrades.entryDecorative', label: 'Decorative Entry Mount',   desc: 'Per unit', unit: '$/unit' },
  { group: 'Unit Design Upgrades', key: 'designUpgrades.boilerRoomDisk',  label: 'Boiler Room Disk',         desc: 'Per unit', unit: '$/unit' },
  { group: 'Unit Design Upgrades', key: 'designUpgrades.fanSize52Adder',  label: '52" Fan Upcharge',         desc: 'Over 48" (0 = no upcharge)', unit: '$/fan' },

  // ── INSTALL LABOR (shown beside each answer; never added to a total) ──
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.sconce',            label: 'Wall Sconce / Frogeye / Wallpack', desc: 'Raw install labor, no OH&P. Also bath bars.', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.surfaceDisk',       label: 'Surface Disk',          desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.recessedDownlight', label: 'Recessed Downlight',    desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.canless',           label: 'Canless Downlight',     desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.strip4ft',          label: '4 ft Strip (stair landing)', desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.garageFixture',     label: 'Garage Fixture',        desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.exitSign',          label: 'Exit Sign',             desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.ceilingFan',        label: 'Ceiling Fan',           desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.areaPole',          label: 'Area Light + Pole',     desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.trenchingPerFt',    label: 'Trenching + Conduit per Foot', desc: 'Per foot of run to each area light (wired sites)', unit: '$/ft' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.trenchFtPerPole',   label: 'Average Trench Run per Pole', desc: 'Feet of trench + conduit per area light. $/ft × this = trenching per pole', unit: 'ft' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.solarPoleCreditPct', label: 'Solar Pole Labor Credit', desc: 'Share of a wired pole\'s labor (pole + trenching) credited back on a solar site. 0.70 = 70%', unit: '×' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.bollard',           label: 'Bollard',               desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.landscapeBullet',   label: 'Landscape Bullet',      desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.pendant',           label: 'Pendant',               desc: 'Per pendant hung', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.stepLight',         label: 'Step Light',            desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.tapePerFt',         label: 'Low-Voltage Tape',      desc: 'Per foot', unit: '$/ft' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.undercabinet24in',  label: '120V Undercabinet',     desc: 'Per 24" piece', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.linear4ft',         label: 'Linear',                desc: 'Per 4 ft', unit: '$/4ft' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.troffer',           label: 'Troffer',               desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.floorUplight',      label: 'Floor Uplight',         desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.switch',            label: 'Switch',                desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.receptacle',        label: 'Receptacle',            desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.emergencyCircuit',  label: 'Emergency Circuit',     desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.fanJBox',           label: 'Fan J-Box',             desc: 'Raw install labor, no OH&P', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.mirrorJBox',        label: 'Lighted Mirror J-Box',  desc: 'Labor for each illuminated-mirror vanity', unit: '$/ea' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.undercabinetFtPerUnit', label: 'Undercabinet Feet per Kitchen', desc: 'Assumed run length used to estimate undercabinet labor', unit: 'ft' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.frogeyeFtEach',     label: 'Corridor Feet per Frogeye', desc: 'One frogeye per this many feet of corridor, for the labor estimate', unit: 'ft' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.corridorWidthFt',   label: 'Corridor Width',        desc: 'Turns corridor SF into feet of corridor for the frogeye count', unit: 'ft' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.frogeyeSfEach',     label: 'Amenity SF per Frogeye', desc: 'Amenity rooms (frogeyes everywhere): one frogeye per this many SF', unit: 'SF' },
  { group: 'Labor (raw — estimated labor + materials)', key: 'labor.pathwayFixture',    label: 'Walking-Path Light',    desc: 'Raw install labor per path light', unit: '$/ea' },

  // ── FREIGHT / WAREHOUSING ─────────────────────────────────────────────
  { group: 'Freight & Warehousing', key: 'freight',     label: 'Freight Rate',     desc: '% of product subtotal (0.06 = 6%)', unit: 'decimal' },
  { group: 'Freight & Warehousing', key: 'warehousing', label: 'Warehousing Rate', desc: '% of product subtotal (0.03 = 3%)', unit: 'decimal' },

  // ── TAKEOFF ESTIMATION FACTORS ────────────────────────────────────────
  { group: 'Takeoff Estimation', key: 'estimation.unitsToGross', label: 'Units → Gross SF Factor', desc: 'Last-resort gross SF estimate: residential unit SF × this factor (covers corridors, walls, BOH). Used only when no total, no per-building totals, and no footprint are on the drawings.', unit: '×' },
  { group: 'Takeoff Estimation', key: 'estimation.landingsContingency',      label: 'Stair Landings Contingency',   desc: 'Added on top of every stair-landing count the app derives from drawings or estimates from code (0.10 = +10%). Not added to a count a person typed.', unit: 'decimal' },
  { group: 'Takeoff Estimation', key: 'estimation.exitStairsMinPerBuilding', label: 'Exit Stairs per Building (min)', desc: 'Building-code fallback when the drawings never state the exit-stair count: at least this many exit stairs per residential building over one story.', unit: 'stairs' },
  { group: 'Takeoff Estimation', key: 'estimation.floorPlateSfPerExitStair', label: 'Floor Plate SF per Exit Stair (corridor)', desc: 'Same fallback, for corridor buildings (wrap / podium / mid-rise / high-rise): one exit stair per this many SF of floor plate (footprint ÷ buildings), for travel distance — never fewer than the minimum above. Calibrated at 15,000 against past projects (2026-09-05).', unit: 'SF' },
  { group: 'Takeoff Estimation', key: 'estimation.breezewayPlateSfPerExitStair', label: 'Floor Plate SF per Exit Stair (breezeway)', desc: 'Same fallback, for garden / gurban / stacked-flat walk-ups: each open breezeway stair serves only the units around it, so a plate holds one per this many SF. Calibrated at 5,000 against past garden projects (2026-09-05). Townhouses get zero shared stairs regardless.', unit: 'SF' },
];

/** Read a nested value from an object using dot-notation key */
function getNestedValue(obj, key) {
  return key.split('.').reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

/** Set a nested value in a (deeply cloned) object using dot-notation key */
function setNestedValue(obj, key, value) {
  const keys = key.split('.');
  const clone = JSON.parse(JSON.stringify(obj));
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
}

export default function PricingEditor({ initialPricing, initialPricingIntel }) {
  const [pricing, setPricing] = useState(initialPricing);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // ── Pricing Intelligence config ──────────────────────────────────────────
  const [piThreshold, setPiThreshold] = useState(
    initialPricingIntel?.pricing_alert_threshold ?? '10'
  );
  const [piWindow, setPiWindow] = useState(
    initialPricingIntel?.pricing_alert_window_months ?? '12'
  );
  const [piSaving, setPiSaving] = useState(false);
  const [piSaved,  setPiSaved]  = useState(false);
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!saved) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saved]);

  async function savePricingIntel() {
    setPiSaving(true); setPiSaved(false);
    try {
      await fetch('/api/system-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pricing_alert_threshold:      String(piThreshold),
          pricing_alert_window_months:  String(piWindow),
        }),
      });
      setPiSaved(true);
      setTimeout(() => setPiSaved(false), 2500);
    } finally {
      setPiSaving(false);
    }
  }

  function handleChange(key, rawValue) {
    const num = parseLooseNumber(rawValue);
    const val = Number.isFinite(num) ? num : rawValue;
    setPricing(prev => setNestedValue(prev, key, val));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setLastSavedAt(new Date());
    } catch (e) {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Group fields by their group label
  const groups = [];
  const seen = {};
  for (const field of PRICING_FIELDS) {
    if (!seen[field.group]) {
      seen[field.group] = true;
      groups.push({ name: field.group, fields: [] });
    }
    groups[groups.length - 1].fields.push(field);
  }
  // Re-group properly
  const groupMap = {};
  for (const field of PRICING_FIELDS) {
    if (!groupMap[field.group]) groupMap[field.group] = [];
    groupMap[field.group].push(field);
  }
  const groupList = Object.entries(groupMap);

  return (
    <div>
      {!saved && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4v2m0-6a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
          </svg>
          <p className="text-sm text-amber-800 flex-1">You have unsaved changes</p>
        </div>
      )}
      {/* Sticky save bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-slate-500">
          Changes take effect immediately for all new budget calculations.
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <div className="flex items-center gap-1">
            {saved && !saving && (
              <>
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Saved
                </span>
                {lastSavedAt && (
                  <span className="text-xs text-slate-400 ml-2">
                    as of {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </>
            )}
          </div>
          <Button variant="amber" loading={saving} onClick={handleSave}>
            Save All Changes
          </Button>
        </div>
      </div>

      {/* Pricing table */}
      <div className="divide-y divide-slate-100">
        {groupList.map(([groupName, fields]) => {
          const isCollapsed = collapsed[groupName];
          return (
            <div key={groupName} className="px-6 py-5">
              <button onClick={() => setCollapsed(c => ({ ...c, [groupName]: !c[groupName] }))} className="w-full text-left flex items-center gap-2 mb-3 group">
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8.5 15a.5.5 0 0 1-.5-.5V2.707L3.854 7.354a.5.5 0 1 1-.708-.708l5-5a.5.5 0 0 1 .708 0l5 5a.5.5 0 0 1-.708.708L8.5 2.707V14.5a.5.5 0 0 1-.5.5z" transform="rotate(-90)" />
                </svg>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest group-hover:text-slate-600">
                  {groupName}
                </h3>
              </button>
              {!isCollapsed && (
                <div className="space-y-0 border border-slate-200 rounded-lg overflow-hidden">
                  {fields.map((field, i) => {
                    const currentVal = getNestedValue(pricing, field.key);
                    return (
                      <div
                        key={field.key}
                        className={`flex items-center px-4 py-2.5 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                      >
                        {/* Label + description */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{field.label}</div>
                          {field.desc && <div className="text-xs text-slate-400 mt-0.5">{field.desc}</div>}
                        </div>
                        {/* Unit badge */}
                        <div className="text-xs text-slate-400 font-mono mx-4 w-20 text-right shrink-0">
                          {field.unit}
                        </div>
                        {/* Input */}
                        <div className="w-32 shrink-0">
                          <input
                            type="number"
                            step="any"
                            value={currentVal ?? ''}
                            onChange={e => handleChange(field.key, e.target.value)}
                            className="w-full text-right text-sm font-mono border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-6 py-4 text-xs text-slate-400 border-t border-slate-100">
        Decimal rates: enter as decimal (e.g. 0.06 = 6%, 0.38 = $0.38/SF). Dollar amounts: enter as whole number (e.g. 125 = $125).
      </div>

      {/* ── Pricing Intelligence config ──────────────────────────────────── */}
      <div className="border-t border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Pricing Intelligence</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Controls when price increase alerts appear on budget line items.
              Alerts fire when a product's price has increased more than this % vs. any prior budget sent in the last N months.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Price increase alert threshold</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max="100" step="1"
                value={piThreshold}
                onChange={e => { setPiThreshold(e.target.value); setPiSaved(false); }}
                className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Price history lookback window</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max="60" step="1"
                value={piWindow}
                onChange={e => { setPiWindow(e.target.value); setPiSaved(false); }}
                className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-sm text-slate-500">months</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={savePricingIntel}
            disabled={piSaving}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-60"
          >
            {piSaving ? 'Saving…' : 'Save'}
          </button>
          {piSaved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          When dept roles have behavioral meaning, this section will also require the Pre-construction dept role.
        </p>
      </div>

    </div>
  );
}
