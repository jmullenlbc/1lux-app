/**
 * Change order money, the one place it is worked out. No database here, so
 * browser pages can import this too (changeOrderRates.js re-exports it).
 */
import { cents, lineTotal, sumCents } from './money.js';

/**
 * Get the effective line items for a group, resolves option groups so only
 * the selected option per group counts, plus all standalone items.
 */
export function resolveLineItems(lineItems) {
  const standalone = lineItems.filter(li => !li.isOptionRow);

  // Find all group roots (isOptionRow = true, parentLineItemId = null)
  const roots = lineItems.filter(li => li.isOptionRow && !li.parentLineItemId);
  const selectedOptions = roots.map(root => {
    const groupMembers = [root, ...lineItems.filter(li => li.parentLineItemId === root.id)];
    // Use selected item, or fall back to root if none explicitly selected
    return groupMembers.find(li => li.isGroupSelected) || root;
  });

  return [...standalone, ...selectedOptions];
}

/**
 * The lines a change order actually buys: the chosen option only, with any per
 * line alternates resolved to the one picked. Empty when no option is chosen.
 */
export function chosenLineItems(changeOrder) {
  const selected = changeOrder.optionGroups?.find(g => g.isSelected);
  if (!selected) return [];
  return resolveLineItems(selected.lineItems || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/**
 * The rates a change order prices at. Sales tax is frozen on the change order,
 * so a rate change on the job never moves an old one. Blank follows the job
 * until the change order is sent.
 */
export function ratesForCO(changeOrder, rates) {
  return { ...rates, salesTaxPct: changeOrder?.salesTaxPct ?? rates?.salesTaxPct ?? null };
}

/**
 * The manual discount in dollars. A percent is worked on the subtotal.
 * discount holds { discountAmount, discountPct }, usually the option group.
 */
export function discountFor(discount, subtotal) {
  if (discount?.discountPct != null) return cents(subtotal * discount.discountPct);
  return cents(discount?.discountAmount ?? 0);
}

/**
 * Calculate the footer for one option group's line items. The discount comes
 * off before tax, freight and warehousing, so those are worked on the
 * discounted figure. subtotal stays the undiscounted sum of the lines. Every
 * part is to the cent before the next step, so the footer adds up by hand.
 * Returns { subtotal, discount, tax, freight, warehousing, total }
 */
export function calcGroupFooter(lineItems, rates, discountFrom = null) {
  const effective = resolveLineItems(lineItems);
  const subtotal = sumCents(effective.map(li => lineTotal(li.qty, li.cnUnitPrice)));
  const discount = discountFor(discountFrom, subtotal);
  const net = cents(subtotal - discount);
  const tax        = rates?.salesTaxPct   != null ? cents(net * rates.salesTaxPct)   : 0;
  const freight    = rates?.freightPct    != null ? cents(net * rates.freightPct)    : 0;
  const warehousing = rates?.warehousingPct != null ? cents(net * rates.warehousingPct) : 0;
  const total      = sumCents([net, tax, freight, warehousing]);
  return { subtotal, discount, tax, freight, warehousing, total };
}

/**
 * Get the total value of a CO (total of the selected option group, or 0).
 */
export function calcCOTotal(changeOrder, rates) {
  const selected = changeOrder.optionGroups?.find(g => g.isSelected);
  if (!selected) return 0;
  const { total } = calcGroupFooter(selected.lineItems || [], ratesForCO(changeOrder, rates), selected);
  return total;
}
