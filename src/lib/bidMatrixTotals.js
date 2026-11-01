/**
 * Bid Matrix footer, the one place it is worked out, for the screen, saved
 * versions and the PDF. No database here, so browser pages can import it.
 */
import { cents, sumCents } from './money.js';

/** "Freight (6%)", or plain "Freight" for typed dollars, which are not a percent. */
export function feeLabel(name, pct, override = null) {
  return override != null || !pct ? name : `${name} (${Number((pct * 100).toFixed(2))}%)`;
}

/**
 * Freight, warehousing and tax are worked on the whole matrix. Typed dollars
 * replace the percent for that one figure, and 0 is real. Lighting gets its
 * own share and controls take the rest, so the two subtotals always add to
 * the Grand Total.
 */
export function matrixFooter(rawLightingIn, rawControlsIn, { freightPct = 0, warehousingPct = 0, salesTaxPct = 0, freightOverride = null, warehousingOverride = null } = {}) {
  const rawLighting = cents(rawLightingIn);
  const rawControls = cents(rawControlsIn);
  const rawTotal = sumCents([rawLighting, rawControls]);
  const freightAmt = cents(freightOverride ?? rawTotal * freightPct);
  const warehousingAmt = cents(warehousingOverride ?? rawTotal * warehousingPct);
  const salesTaxAmt = cents(rawTotal * salesTaxPct);
  const totalAdders = sumCents([freightAmt, warehousingAmt, salesTaxAmt]);
  const grandTotal = sumCents([rawTotal, totalAdders]);
  // Typed dollars count as their share of the matrix, so lighting carries its part.
  const shareOf = (override, pct) => (override == null ? pct : rawTotal ? cents(override) / rawTotal : 0);
  const loaded = shareOf(freightOverride, freightPct) + shareOf(warehousingOverride, warehousingPct) + salesTaxPct;
  const subtotalLighting = rawControls === 0 ? grandTotal
    : rawLighting === 0 ? 0
    : sumCents([rawLighting, rawLighting * loaded]);
  const subtotalControls = cents(grandTotal - subtotalLighting);
  return { rawLighting, rawControls, rawTotal, freightAmt, warehousingAmt, salesTaxAmt, totalAdders, subtotalLighting, subtotalControls, grandTotal };
}
