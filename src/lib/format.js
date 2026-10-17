/**
 * Display formatting helpers with ZERO imports.
 *
 * formatCurrency used to live in calculations.js, but that module imports the
 * whole PRICING model, so any client component that just wanted to print a
 * dollar figure was dragging ILC's cost book into its JS bundle. Behind auth
 * that's tolerable; on the public /conceptual_budget page it is not. Public
 * pages and shared display components import from HERE. calculations.js
 * re-exports this for the existing internal imports.
 */
export function formatCurrency(val, compact = false) {
  if (val == null || isNaN(val) || !isFinite(val)) return '$0';
  if (compact && val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (compact && val >= 1000)    return `$${(val / 1000).toFixed(0)}K`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}
