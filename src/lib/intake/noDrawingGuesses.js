/**
 * The stand-in figures for a conceptual budget typed in WITHOUT drawings
 * (Mike, 2026-09-11: "we need to figure out which ones are actually required
 * and which ones can be guessed").
 *
 * Required (see noDrawingsReady in questionnaire.js): project type, total
 * units, and total building SF or an average unit size. Everything below
 * fills a blank on the no-drawings form, and ONLY there — a drawing-read
 * budget never uses these; a blank there is asked for, not guessed.
 *
 * Every guess lands in the takeoff as source 'derived' with an ESTIMATED flag,
 * so the visitor sees "our estimate" and the reviewer sees what to confirm.
 * Keyed by the engine's building-type keys (questionnaire projectType map).
 *
 * Server-side only: imported by quantities.js, never by the public wizard.
 */
export const NO_DRAWING_GUESSES = {
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
  // Clubhouse / leasing / fitness per unit.
  interiorAmenitySfPerUnit: {
    singleFamily: 0, townHouses: 20, stackedFlats: 20, garden: 20, gurban: 20,
    wrap: 20, podium: 20, midRise: 20, highRise: 20,
  },
  // Balconies: one per unit, unless the balcony question says "None" or the
  // type has none.
  balconiesPerUnit: {
    singleFamily: 0, townHouses: 0, stackedFlats: 1, garden: 1, gurban: 1,
    wrap: 1, podium: 1, midRise: 1, highRise: 1,
  },
};
