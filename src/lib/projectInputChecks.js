// Project Data input checks.
//
// The conceptual budget engine treats null / missing inputs as zero, which
// silently suppresses entire calculation sections without telling the user.
// On 2026-06-18, Manuel's first run on "The Approach" landed 37% under the
// source spreadsheet because he left ~9 Project Data fields blank — the
// engine produced $0 for Exterior, $0 for vanity, $0 for stairwell
// landings, and the resulting budget was unsendable.
//
// This module enumerates the inputs that silently zero out real charges
// when blank. The MissingInputsWarning component reads this list and
// surfaces a warning on the Summary + Project Overview views.
//
// Only fields where blank = unambiguously wrong are listed. Fields with
// safe engine fallbacks (freightPct → 0.06 default, unitsSf → grossSf
// fallback, numFans → derived from selection) are intentionally left out.
// Adding them here would turn the warning into noise.

export const CRITICAL_PROJECT_INPUTS = [
  {
    field:   'exteriorAmenitySf',
    label:   'Exterior Amenity SF',
    section: 'Exterior & Site',
    impact:  'Exterior amenities calc = $0',
  },
  {
    field:   'lotSf',
    label:   'Lot Size SF',
    section: 'Exterior & Site',
    impact:  'Landscape calc = $0',
  },
  {
    field:   'numSurfaceParking',
    label:   '# Surface Parking Stalls',
    section: 'Exterior & Site',
    impact:  'Parking calc = $0',
  },
  {
    field:   'numExteriorDoors',
    label:   '# Exterior Doors',
    section: 'Exterior & Site',
    impact:  'Exterior door sconces = $0',
  },
  {
    field:   'numEgressStairwells',
    label:   '# Egress Stairwell Landings',
    section: 'Corridors & Stairwells',
    impact:  'Stairwell calc = $0',
  },
  {
    field:           'numVanities',
    label:           '# Vanities',
    section:         'Residential Units',
    impact:          'Vanity calc = $0',
    // The engine falls back to numBathrooms when numVanities is blank.
    // Only flag if BOTH are missing.
    alsoCheckField: 'numBathrooms',
  },
];

/**
 * Given a projectData record, return the list of critical inputs that are
 * blank/null/missing. Returns empty array if all is well.
 *
 * Treats null, undefined, and '' as missing. Treats explicit 0 as filled —
 * the user actively said "zero" rather than skipped, which is meaningful
 * (and won't have been an accident the way leaving the field blank is).
 */
export function findMissingProjectInputs(projectData) {
  if (!projectData) return [];
  return CRITICAL_PROJECT_INPUTS.filter(check => {
    const v = projectData[check.field];
    const isBlank = (v === null || v === undefined || v === '');
    if (!isBlank) return false;
    // If a fallback field is filled, the engine handles it — don't warn.
    if (check.alsoCheckField) {
      const fallback = projectData[check.alsoCheckField];
      const fallbackFilled =
        fallback !== null && fallback !== undefined && fallback !== '' &&
        Number(fallback) > 0;
      if (fallbackFilled) return false;
    }
    return true;
  });
}

/** Group a missing-inputs list by their `section` for display. */
export function groupMissingBySection(missing) {
  const grouped = {};
  for (const m of missing) {
    if (!grouped[m.section]) grouped[m.section] = [];
    grouped[m.section].push(m);
  }
  return grouped;
}
