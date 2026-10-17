/**
 * Estimated sales tax by state (Mike 10-17). The real rate is set by the
 * street address, which only paid services (Avalara) look up, so both
 * conceptual tools prefill this estimate and the user can overwrite it.
 *
 * State rate + the state's average local rate, from the Tax Foundation's free
 * "2026 sales tax rates midyear" table (as of July 1, 2026). Refresh once a
 * year from taxfoundation.org. Browser-safe: no database.
 */
export const SALES_TAX_TABLE_AS_OF = 'July 1, 2026';

const COMBINED_PCT = Object.freeze({
  AL: 9.46, AK: 1.82, AZ: 8.54, AR: 9.48, CA: 9.03, CO: 7.89, CT: 6.35, DE: 0,
  DC: 6.0, FL: 6.98, GA: 7.56, HI: 4.5, ID: 6.03, IL: 8.98, IN: 7.0, IA: 6.94,
  KS: 8.71, KY: 6.0, LA: 10.13, ME: 5.5, MD: 6.0, MA: 6.25, MI: 6.0, MN: 8.14,
  MS: 7.06, MO: 8.44, MT: 0, NE: 6.98, NV: 8.24, NH: 0, NJ: 6.6, NM: 7.68,
  NY: 8.54, NC: 7.1, ND: 7.09, OH: 7.29, OK: 9.06, OR: 0, PA: 6.34, RI: 7.0,
  SC: 7.49, SD: 6.11, TN: 9.61, TX: 8.2, UT: 7.42, VT: 6.43, VA: 5.77, WA: 9.57,
  WV: 6.6, WI: 5.72, WY: 5.39,
});

/** The estimate as the box shows it ("8.2"), or '' for an unknown state. */
export function estimatedSalesTaxPct(state) {
  const pct = COMBINED_PCT[String(state || '').trim().toUpperCase()];
  return pct == null ? '' : String(pct);
}

/**
 * What the tax box should hold once the state reads as a real state: that
 * state's estimate while the box is blank or still shows the estimate we last
 * put there; a rate the user typed is left alone. Half-typed states change
 * nothing. The caller remembers the last estimate it placed.
 * nextTaxBox('', '', 'TX') → '8.2'; nextTaxBox('8.2', '8.2', 'CO') → '7.89';
 * nextTaxBox('9', '8.2', 'CO') → '9'; nextTaxBox('8.2', '8.2', 'C') → '8.2'.
 */
export function nextTaxBox(current, lastEstimate, newState) {
  const est = estimatedSalesTaxPct(newState);
  const cur = String(current ?? '').trim();
  if (!est || (cur && cur !== lastEstimate)) return current ?? '';
  return est;
}
