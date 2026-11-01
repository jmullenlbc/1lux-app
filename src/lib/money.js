/**
 * Money rounding, one rule for the whole app (Mike 10-31): round to the cent
 * first, then do the next step with the rounded number, so everything printed
 * adds up by hand. No imports, so browser and public pages can use this too.
 */

/**
 * To the cent, half up. A credit rounds the same way a charge does. The 15
 * digits clear float noise, so 1.005 lands on 1.01 and not 1.00.
 */
export function cents(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return (Math.sign(v) * Math.round(Number((Math.abs(v) * 100).toPrecision(15)))) / 100 || 0;
}

/** Quantity times a price we set: the price to the cent, then the line to the cent. */
export function lineTotal(qty, unit) {
  return cents((Number(qty) || 0) * cents(unit));
}

/** Adds amounts to the cent. Each one is rounded before it goes in. */
export function sumCents(amounts) {
  return cents(amounts.reduce((s, v) => s + cents(v), 0));
}
