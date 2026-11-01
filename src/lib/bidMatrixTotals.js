/**
 * Bid Matrix footer, the one place it is worked out, for the screen, saved
 * versions and the PDF. No database here, so browser pages can import it.
 */
import { cents, sumCents } from './money.js';

/**
 * Freight, warehousing and tax are worked on the whole matrix. Lighting gets
 * its own share and controls take the rest, so the two subtotals always add
 * to the Grand Total.
 */
export function matrixFooter(rawLightingIn, rawControlsIn, { freightPct = 0, warehousingPct = 0, salesTaxPct = 0 } = {}) {
  const rawLighting = cents(rawLightingIn);
  const rawControls = cents(rawControlsIn);
  const rawTotal = sumCents([rawLighting, rawControls]);
  const freightAmt = cents(rawTotal * freightPct);
  const warehousingAmt = cents(rawTotal * warehousingPct);
  const salesTaxAmt = cents(rawTotal * salesTaxPct);
  const totalAdders = sumCents([freightAmt, warehousingAmt, salesTaxAmt]);
  const grandTotal = sumCents([rawTotal, totalAdders]);
  const loaded = freightPct + warehousingPct + salesTaxPct;
  const subtotalLighting = rawControls === 0 ? grandTotal
    : rawLighting === 0 ? 0
    : sumCents([rawLighting, rawLighting * loaded]);
  const subtotalControls = cents(grandTotal - subtotalLighting);
  return { rawLighting, rawControls, rawTotal, freightAmt, warehousingAmt, salesTaxAmt, totalAdders, subtotalLighting, subtotalControls, grandTotal };
}
