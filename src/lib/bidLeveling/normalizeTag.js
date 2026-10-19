/**
 * Fixture type tag rules for Bid Leveling (Mike 10-18). Pure and deterministic;
 * runs before any AI. Bids join on the type tag, never on the description.
 *
 *   "LT03" / "LT 03" / "LT-3"   all match "LT-03"      (matchKey LT3)
 *   "R1-24'" / "R1 24FT"         type R1, length 24 ft  (rolls up into R1)
 *   "S4-10.5'"                   type S4, length 10.5 ft
 *   "ZP1-P" / "ZP1 POLE"         type ZP1, variant P    (folds into ZP1's price)
 *   R4 + "FIRE HOOD ALLOWANCE"   type R4, variant HOOD  (its own matrix row)
 *   "S3.1"                       stays S3.1 (a dotted suffix is a real type)
 */

// Variants whose price is part of the parent fixture (a pole is bought with
// its head). Other variants (HOOD) stay their own matrix row.
export const FOLD_VARIANTS = new Set(['P']);

export function cleanTag(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '');
}

/** The key two spellings of one tag share: no separators, no leading zeros. */
export function matchKeyOf(tag) {
  return cleanTag(tag)
    .replace(/[-\s_]/g, '')
    .replace(/\d+(\.\d+)?/g, (n) => {
      const [whole, frac] = n.split('.');
      return String(parseInt(whole, 10)) + (frac != null ? '.' + frac : '');
    });
}

const LENGTH_RE = /^(.*?\d[A-Z]?)[-\s]+(\d+(?:\.\d+)?)\s*(?:'|FT\.?|FEET)?$/;
const POLE_RE = /^(.*\d)[-\s]+(?:P|POLE)$/;
const HOOD_RE = /\bFIRE\s+HOOD\b|\bHOOD\s+ALLOWANCE\b/i;

/**
 * Split one quoted line's tag into { typeTag, variant, lengthFt, matchKey }.
 * `typeTag` is the cleaned spelling as quoted; display spelling is chosen by
 * the engine (baseline bid's spelling wins).
 */
export function normalizeTag(raw, { description = '', catalog = '', mfr = '' } = {}) {
  const tag = cleanTag(raw);
  let base = tag;
  let variant = '';
  let lengthFt = null;

  const pole = tag.match(POLE_RE);
  const len = !pole && tag.match(LENGTH_RE);
  if (pole) {
    base = pole[1];
    variant = 'P';
  } else if (len) {
    base = len[1];
    lengthFt = Number(len[2]);
    variant = `${len[2]}'`;
  }

  // A MISC line under a real tag that is a hood or barrier allowance.
  const text = `${description} ${catalog}`;
  if (!variant && HOOD_RE.test(text) && (!mfr || /^MISC$/i.test(String(mfr).trim()) || !catalog || HOOD_RE.test(catalog))) {
    variant = 'HOOD';
  }

  return { typeTag: base, variant, lengthFt, matchKey: matchKeyOf(base) };
}

/**
 * Roll length variants (R1-6', R1-8', ...) into one parent line.
 * uom 'LF' sums count x length; 'EA' sums the counts. The caller picks the uom
 * from another bid's line for the same type (ILC's matrix states it); with no
 * hint, feet win because a length suffix means a linear product.
 */
export function rollUpLengths(parts, uom = 'LF') {
  const count = parts.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  const feet = parts.reduce((s, p) => s + (Number(p.qty) || 0) * (p.lengthFt || 0), 0);
  const qty = uom === 'EA' ? count : feet;
  const allExt = parts.every((p) => p.extPrice != null);
  const extPrice = allExt ? parts.reduce((s, p) => s + Number(p.extPrice), 0) : null;
  return {
    qty: Math.round(qty * 100) / 100,
    uom,
    extPrice,
    unitPrice: extPrice != null && qty > 0 ? extPrice / qty : null,
    children: parts,
  };
}
