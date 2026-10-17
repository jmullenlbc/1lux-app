/**
 * Unit Selections, "pick a look".
 *
 * A look is a style name. Choosing one picks, for every fixture still in play,
 * the first fixture on offer in that style, so a person gets a whole answer in
 * one click and then swaps whatever they do not like.
 *
 * PURE and import-free on purpose: the survey screen imports this in the
 * browser, and a future share page will too. It must never reach pricing.js,
 * the engine, or the database. It only ever sees options that eligibleOptions()
 * already let through, so it cannot put an over-budget fixture on a board.
 */

export const LOOKS = Object.freeze([
  { key: 'modern',       label: 'Modern',       blurb: 'Clean lines, simple shapes' },
  { key: 'transitional', label: 'Transitional', blurb: 'Soft curves, a little warmth' },
  { key: 'traditional',  label: 'Traditional',  blurb: 'Lanterns and classic detail' },
  { key: 'farmhouse',    label: 'Farmhouse',    blurb: 'Rustic, relaxed, lantern-heavy' },
  { key: 'industrial',   label: 'Industrial',   blurb: 'Exposed, cage and metal' },
]);

/**
 * When the pool has nothing in a style for one fixture, the nearest style
 * stands in rather than leaving a hole in the board.
 */
const NEAREST = Object.freeze({
  modern:       ['modern', 'transitional', 'industrial', 'traditional', 'farmhouse'],
  transitional: ['transitional', 'modern', 'traditional', 'farmhouse', 'industrial'],
  traditional:  ['traditional', 'transitional', 'farmhouse', 'modern', 'industrial'],
  farmhouse:    ['farmhouse', 'traditional', 'transitional', 'industrial', 'modern'],
  industrial:   ['industrial', 'modern', 'farmhouse', 'transitional', 'traditional'],
});

export const FINISHES = Object.freeze([
  { key: 'matte_black',    label: 'Matte black',    color: '#2b2b2b' },
  { key: 'brushed_nickel', label: 'Brushed nickel', color: '#a9abae' },
  { key: 'aged_brass',     label: 'Aged brass',     color: '#b08d57' },
  { key: 'bronze',         label: 'Bronze',         color: '#6b4f3a' },
  { key: 'chrome',         label: 'Chrome',         color: '#cfd4d9' },
  { key: 'white',          label: 'White',          color: '#f4f4f2' },
]);

export const finishColor = key => FINISHES.find(f => f.key === key)?.color || '#9ca3af';
export const finishLabel = key => FINISHES.find(f => f.key === key)?.label || key || '—';

/**
 * The finish a pick should wear: the one asked for when this fixture comes in
 * it, otherwise the fixture's own default.
 */
export function finishFor(option, wanted) {
  const finishes = option?.finishes || [];
  if (wanted && finishes.some(f => f.finishKey === wanted)) return wanted;
  return (finishes.find(f => f.isDefault) || finishes[0])?.finishKey || null;
}

/**
 * One board: {category -> option} for every category that has anything on
 * offer, in the style asked for or the nearest one that exists.
 *
 * @param {string} style
 * @param {Array}  categories  the GET route's categories (options already cut)
 */
export function lookBoard(style, categories = []) {
  const order = NEAREST[style] || [style];
  const board = {};
  for (const cat of categories) {
    if (cat.skipped || !cat.options?.length) continue;
    let found = null;
    for (const s of order) {
      found = cat.options.find(o => o.style === s);
      if (found) break;
    }
    board[cat.key] = { option: found || cat.options[0], exact: found?.style === style };
  }
  return board;
}

/**
 * The picks that choosing a look (and optionally one finish) makes. Fans keep
 * white unless the person has said otherwise.
 *
 * @returns {Array<{category, optionId, finishKey}>}
 */
export function lookPicks(style, categories, { finishKey = null, fanHoldWhite = true } = {}) {
  const board = lookBoard(style, categories);
  return Object.entries(board).map(([category, { option }]) => ({
    category,
    optionId: option.id,
    finishKey: finishFor(option, category === 'f1' && fanHoldWhite ? 'white' : finishKey),
  }));
}

/**
 * Re-finish what somebody already picked. Anything that does not come in the
 * finish keeps the one it had, and fans stay white when held.
 */
export function refinishPicks(choices = [], categories = [], finishKey, { fanHoldWhite = true } = {}) {
  const byId = {};
  for (const c of categories) for (const o of c.options || []) byId[o.id] = o;
  return choices
    .filter(c => c.kind === 'PICK' && byId[c.optionId])
    .filter(c => !(c.category === 'f1' && fanHoldWhite))
    .map(c => ({
      category: c.category,
      optionId: c.optionId,
      finishKey: byId[c.optionId].finishes?.some(f => f.finishKey === finishKey) ? finishKey : c.finishKey,
    }));
}
