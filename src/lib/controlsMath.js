// Controls math shared by the engine (calculations.js) and the internal
// Controls screen, so the preview on the screen cannot drift from the budget.
// Client-safe: only reads master pricing.
import { cents } from './money.js';

const num = (v, d = 0) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : d;
};

/**
 * Energy credit % per side for the picked program (Mike 10-15: LEED and NGBS
 * 3% / 3%, WELL 10% lighting / 30% controls). A program stored as a plain
 * number puts that % on both sides. An old yes-only answer, or a program the
 * sheet does not know, uses the flat energyCreditAdderPct on both sides.
 * "none" (or no program and no yes) = 0 / 0.
 */
export function energyCreditPcts(P, controls = {}) {
  const C = P?.controls || {};
  const program = String(controls?.energyCreditProgram || '').toLowerCase();
  const on = controls?.energyCredit === 'yes' || (program && program !== 'none');
  if (!on || program === 'none') return { lighting: 0, controls: 0, program: program || null };
  return { ...programPcts(P, program), program: program || null };
}

/** The two percentages a program carries, before the on/off question. */
export function programPcts(P, program) {
  const C = P?.controls || {};
  const fallback = num(C.energyCreditAdderPct, 0.03);
  const raw = C.energyCreditPrograms?.[String(program || '').toLowerCase()];
  if (raw == null) return { lighting: fallback, controls: fallback };
  if (typeof raw === 'number' || typeof raw === 'string') {
    const both = num(raw, fallback);
    return { lighting: both, controls: both };
  }
  return { lighting: num(raw.lighting, fallback), controls: num(raw.controls, fallback) };
}

/**
 * Garage controls (Mike 10-15): the building type $/SF prices the building
 * WITHOUT its garage; the garage is priced on its own SF at controls.garage
 * .perSf, never under minDollars ($2K) or over maxDollars ($10K). Both pieces
 * add up to ONE controls number, still under the type cap.
 *
 * Gross SF on a drawing read usually includes the garage; the no-drawings
 * ladder (units x avg SF x 1.25) never does. Only the SF above the units,
 * corridors and amenity can be garage: that much (up to the garage size) is
 * taken out of gross for the building piece. A gross that is just the units,
 * corridors and amenity already excludes the garage and is used whole.
 */
export function controlsGaragePiece(P, { grossSf = 0, garageSf = 0, unitsSf = 0, corridorSf = 0, intAmenitySf = 0 } = {}) {
  const G = P?.controls?.garage;
  const gross = Math.max(0, num(grossSf));
  const garage = Math.max(0, num(garageSf));
  const perSf = num(G?.perSf, 0.035);
  const minD = num(G?.minDollars, 2000);
  const maxD = num(G?.maxDollars, 10000);

  // A frozen pricing snapshot from before 10-16 has no controls.garage block:
  // those projects keep pricing the way they did (full gross, no garage add).
  if (!G || !(garage > 0)) return { buildingSf: gross, garageSf: 0, dollars: 0, grossIncludedGarage: false, perSf, minDollars: minD, maxDollars: maxD };

  const units = Math.max(0, num(unitsSf));
  const floor = (units > 0 && units < gross ? units : 0) + Math.max(0, num(corridorSf)) + Math.max(0, num(intAmenitySf));
  // Only the SF above that floor can be garage, up to the garage size, so the
  // building piece never jumps by a whole garage when the gross is nudged
  // across the line (fuzz INV7: the total must not fall as gross rises).
  const removed = Math.min(garage, Math.max(0, gross - floor));
  const grossIncludedGarage = removed >= garage;
  const buildingSf = gross - removed;
  const dollars = cents(Math.min(maxD, Math.max(minD, garage * perSf)));
  return { buildingSf, garageSf: garage, garageRemovedSf: removed, dollars, grossIncludedGarage, perSf, minDollars: minD, maxDollars: maxD };
}
