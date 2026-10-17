/**
 * Shared helper: get project budget rates for CO footer calculations.
 * Reads from projectData, same source as the budget module.
 */
import { prisma } from '@/lib/db';

export async function getProjectRates(projectId) {
  const pd = await prisma.projectData.findUnique({ where: { projectId } });
  return {
    salesTaxPct:   pd?.salesTaxPct   ?? null,
    freightPct:    pd?.freightPct    ?? 0.06,
    warehousingPct: pd?.warehousingPct ?? 0.03,
    marginPct:     pd?.marginPct     ?? 0.23,
  };
}

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
 * Calculate the footer for one option group's line items.
 * Returns { subtotal, tax, freight, warehousing, total }
 */
export function calcGroupFooter(lineItems, rates) {
  const effective = resolveLineItems(lineItems);
  const subtotal = effective.reduce((s, li) => s + ((li.qty || 0) * (li.cnUnitPrice || 0)), 0);
  const tax        = rates.salesTaxPct   != null ? subtotal * rates.salesTaxPct   : 0;
  const freight    = rates.freightPct    != null ? subtotal * rates.freightPct    : 0;
  const warehousing = rates.warehousingPct != null ? subtotal * rates.warehousingPct : 0;
  const total      = subtotal + tax + freight + warehousing;
  return { subtotal, tax, freight, warehousing, total };
}

/**
 * Get the total value of a CO (total of the selected option group, or 0).
 */
export function calcCOTotal(changeOrder, rates) {
  const selected = changeOrder.optionGroups?.find(g => g.isSelected);
  if (!selected) return 0;
  const { total } = calcGroupFooter(selected.lineItems || [], rates);
  return total;
}

/**
 * Auto-generate the next coNumber for a project: CO-00001, CO-00002, ...
 */
export async function nextCoNumber(projectId) {
  const last = await prisma.changeOrder.findFirst({
    where: { projectId },
    orderBy: { coNumber: 'desc' },
    select: { coNumber: true },
  });
  const n = last ? parseInt(last.coNumber.replace('CO-', ''), 10) + 1 : 1;
  return `CO-${String(n).padStart(5, '0')}`;
}
