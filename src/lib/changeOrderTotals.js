/**
 * Change order money, the one place it is worked out. No database here, so
 * browser pages can import this too (changeOrderRates.js re-exports it).
 */

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
 * The manual discount in dollars. A percent is worked on the subtotal.
 * discount holds { discountAmount, discountPct }, usually the option group.
 */
export function discountFor(discount, subtotal) {
  if (discount?.discountPct != null) return subtotal * discount.discountPct;
  return discount?.discountAmount ?? 0;
}

/**
 * Calculate the footer for one option group's line items. The discount comes
 * off before tax, freight and warehousing, so those are worked on the
 * discounted figure. subtotal stays the undiscounted sum of the lines.
 * Returns { subtotal, discount, tax, freight, warehousing, total }
 */
export function calcGroupFooter(lineItems, rates, discountFrom = null) {
  const effective = resolveLineItems(lineItems);
  const subtotal = effective.reduce((s, li) => s + ((li.qty || 0) * (li.cnUnitPrice || 0)), 0);
  const discount = discountFor(discountFrom, subtotal);
  const net = subtotal - discount;
  const tax        = rates?.salesTaxPct   != null ? net * rates.salesTaxPct   : 0;
  const freight    = rates?.freightPct    != null ? net * rates.freightPct    : 0;
  const warehousing = rates?.warehousingPct != null ? net * rates.warehousingPct : 0;
  const total      = net + tax + freight + warehousing;
  return { subtotal, discount, tax, freight, warehousing, total };
}

/**
 * Get the total value of a CO (total of the selected option group, or 0).
 */
export function calcCOTotal(changeOrder, rates) {
  const selected = changeOrder.optionGroups?.find(g => g.isSelected);
  if (!selected) return 0;
  const { total } = calcGroupFooter(selected.lineItems || [], rates, selected);
  return total;
}
