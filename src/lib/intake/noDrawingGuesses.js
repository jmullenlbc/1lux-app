/**
 * The stand-in figures for a conceptual budget typed in WITHOUT drawings
 * (Mike, 2026-09-11: "we need to figure out which ones are actually required
 * and which ones can be guessed").
 *
 * Required (see noDrawingsReady in questionnaire.js): project type, total
 * units, total building SF or an average unit size, stories and surface
 * stalls (the last two since 2026-09-12). Everything below fills a blank on
 * the no-drawings form, and ONLY there — a drawing-read budget never uses
 * these; a blank there is asked for, not guessed. The stories and parking
 * guesses stay as a backstop for submissions saved before they were required.
 *
 * Every guess lands in the takeoff as source 'derived' with an ESTIMATED flag,
 * so the visitor sees "our estimate" and the reviewer sees what to confirm.
 * Keyed by the engine's building-type keys (questionnaire projectType map).
 *
 * Calibrated 2026-09-12 against ten real ILC conceptual budgets (Mike: "we
 * have to get all these percentages within 10% in the conceptual budget"):
 * Eastchase, Firestone, Fulshear, Easton Park (garden), Echo Trail
 * (townhomes), Greenville + Ross, Aspen Grove (podium), Lake Pointe, Sheridan
 * (wrap) and Rice Village (high-rise). The per-type observations sit beside
 * each table.
 *
 * Server-side only: imported by quantities.js, never by the public wizard.
 */
export const NO_DRAWING_GUESSES = {
  // Average unit SF, used ONLY for the provisional sidebar price before the
  // visitor has typed a building size (Mike 10-9: "the budget should show up
  // even if not everything's filled in"). Never reaches a submitted budget:
  // submitting still needs the real size.
  avgUnitSfByType: {
    singleFamily: 2200, townHouses: 1500, stackedFlats: 950, garden: 900, gurban: 900,
    wrap: 850, podium: 850, midRise: 850, highRise: 900,
  },
  // Stories: the low end of each type's own label ("Garden (3 Levels)",
  // "Podium (3-8 Levels)" is usually 5, "High Rise (12+)" starts at 12).
  storiesByType: {
    singleFamily: 2, townHouses: 3, stackedFlats: 3, garden: 3, gurban: 4,
    wrap: 4, podium: 5, midRise: 10, highRise: 15,
  },
  // Open-air surface stalls per unit. Walk-ups park on surface lots; wrap,
  // podium and towers park in their garage, so no surface lot is assumed.
  surfaceParkingPerUnit: {
    singleFamily: 0, townHouses: 0.5, stackedFlats: 1.5, garden: 1.5, gurban: 1.5,
    wrap: 0, podium: 0, midRise: 0, highRise: 0,
  },
  // Interior corridors as a share of building gross. Breezeway walk-ups and
  // townhouses have no interior corridors to light.
  corridorPctOfGross: {
    singleFamily: 0, townHouses: 0, stackedFlats: 0, garden: 0, gurban: 0,
    wrap: 0.12, podium: 0.12, midRise: 0.12, highRise: 0.12,
  },
  // Clubhouse / leasing / fitness per unit. Real: gardens 16–20, wrap 18–26,
  // podium 22–35, high-rise 39. Townhouse and single-family communities may
  // or may not have one — the clubhouse question decides (see below).
  interiorAmenitySfPerUnit: {
    singleFamily: 0, townHouses: 0, stackedFlats: 19, garden: 19, gurban: 19,
    wrap: 22, podium: 25, midRise: 30, highRise: 38,
  },
  // "Yes, there's a clubhouse" on a townhouse / single-family job with no SF
  // typed: one building of this size (Echo Trail's was 4,000 SF for 64 homes).
  // Apartment types use the per-unit figure above instead.
  clubhouseSfWhenYes: {
    singleFamily: 4000, townHouses: 4000,
  },
  // Balconies: one per unit, unless the balcony question says "None" or the
  // type has none.
  balconiesPerUnit: {
    singleFamily: 0, townHouses: 0, stackedFlats: 1, garden: 1, gurban: 1,
    wrap: 1, podium: 1, midRise: 1, highRise: 1,
  },
  // Bathroom vanities per unit — without it the vanity answer prices at $0.
  // Real counts: 1.37–1.44 per apartment (Eastchase 468/324, Greenville
  // 559/408, Lake Pointe 493/352, Rice 468/331). Townhomes run 2–3 baths.
  // Used only when there is no bathroom count and no bedroom mix, and only
  // until a person adopts what our real jobs say on the Pre-Con dashboard
  // (ConfirmedGuess). Mike 2026-09-24: 1.4 per apartment.
  vanitiesPerUnit: {
    singleFamily: 2.5, townHouses: 2.5, stackedFlats: 1.4, garden: 1.4, gurban: 1.4,
    wrap: 1.4, podium: 1.4, midRise: 1.4, highRise: 1.4,
  },
  // Structured parking garage SF per unit. Real: Sheridan (wrap) 523,
  // Greenville (podium) 570, Aspen Grove (podium) 577, Rice (high-rise) 640.
  // Walk-ups and townhouses park on the surface or in private garages.
  garageSfPerUnit: {
    singleFamily: 0, townHouses: 0, stackedFlats: 0, garden: 0, gurban: 0,
    wrap: 520, podium: 570, midRise: 600, highRise: 640,
  },
  // Pool deck / courtyards / dog park SF per unit. Real: gardens 9–50
  // (median ~26), wrap 63–71, podium 15–19, high-rise 76. Townhouse
  // communities rarely light an outdoor amenity (Echo Trail: none).
  exteriorAmenitySfPerUnit: {
    singleFamily: 0, townHouses: 0, stackedFlats: 25, garden: 25, gurban: 25,
    wrap: 65, podium: 20, midRise: 40, highRise: 75,
  },
  // Area lights (pole + head) along the private drive, per unit, on a
  // community with no parking lot to carry them. Echo Trail (64 townhomes, one
  // drive with homes both sides): 33 area lights. Counted against the parking
  // lot's own poles, so a community that has a lot gets only the difference.
  // Single-family neighborhoods get the same rate (Mike, 2026-09-12: "Yes they
  // should").
  driveLaneLightsPerUnit: {
    singleFamily: 0.5,
    townHouses: 0.5,
  },
  // Garages (one sconce per door) when the visitor leaves the box blank. Mike
  // 2026-09-13: townhomes start at 1 garage per home. Other garage types
  // (see GARAGE_TYPE_KEYS in questionnaire.js) are asked, not guessed.
  garagesPerUnit: {
    townHouses: 1,
  },
  // Back of house as a share of building gross (mechanical, storage, trash,
  // bike rooms). Real: gardens 0.7–0.9% (Fulshear 2.8%), wrap 1.7–2.6%,
  // podium 2.4%, high-rise 3.5%; townhouses none. Never above the master
  // sheet's 5% cap, and never more than what the building has left over.
  bohPctOfGross: {
    singleFamily: 0, townHouses: 0, stackedFlats: 0.01, garden: 0.01, gurban: 0.01,
    wrap: 0.02, podium: 0.025, midRise: 0.03, highRise: 0.035,
  },
};
