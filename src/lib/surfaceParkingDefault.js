/**
 * Surface parking stalls when nobody counted them (Mike 2026-10-15).
 *
 * Without drawings there is no site plan to count stalls on, and the Excel
 * budgets for garden and wrap jobs still carried a big area-light line
 * (Eastchase: 85 poles, $112,691, a fifth of the budget) that the tool priced
 * at $0. So a BLANK stall count on the building types that always park
 * outside gets a default of units × a per-type ratio from the master pricing
 * sheet (exterior.surfaceParking.defaultStallsPerUnit).
 *
 * Standing rule: a typed 0 means zero (all parking in a garage); only a blank
 * is estimated. Types not in the ratio table (podium, mid-rise, high-rise,
 * stacked flats, gurban) stay at 0 when blank: their parking is structured.
 *
 * Pure: no Prisma, safe in the browser (ExteriorSection reads it too).
 */

const DEFAULT_RATIOS = { singleFamily: 0.5, townHouses: 0.5, garden: 2, wrap: 0.5 };

export function isBlankStallCount(v) {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
}

/**
 * @returns {{ stalls:number, estimated:boolean, perUnit:number|null, units:number }}
 */
export function surfaceStalls(pd, pricing) {
  const p = pd || {};
  const raw = p.numSurfaceParking;
  const units = Math.max(0, Number(p.numUnits) || 0);
  if (!isBlankStallCount(raw)) {
    const typed = Number(raw);
    return { stalls: Number.isFinite(typed) && typed > 0 ? typed : 0, estimated: false, perUnit: null, units };
  }
  const ratios = pricing?.exterior?.surfaceParking?.defaultStallsPerUnit || DEFAULT_RATIOS;
  const type = p.buildingTypeKey || null;
  const perUnit = type && Number(ratios[type]) > 0 ? Number(ratios[type]) : null;
  if (!perUnit || units <= 0) return { stalls: 0, estimated: false, perUnit: null, units };
  return { stalls: Math.round(units * perUnit), estimated: true, perUnit, units };
}

export const SURFACE_STALL_DEFAULT_RATIOS = DEFAULT_RATIOS;
