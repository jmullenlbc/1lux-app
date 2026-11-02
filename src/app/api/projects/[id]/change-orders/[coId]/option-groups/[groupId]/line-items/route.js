import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { coProducts } from '@/lib/changeOrderProductStart';
import { productKey } from '@/lib/changeOrderProducts';

const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// POST, add line item to group
// body.action: 'add_line' | 'add_option' | 'add_fee'
// body.fromType: on add_line, start the line from this product on the budget
// body.afterItemId: insert after this item ID
// body.parentLineItemId: for add_option, the root of the group
export async function POST(req, { params }) {
  const { error } = await requirePermission(req, 'editJobMoney'); // Construction, Operations, Finance, admins
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'This change order is approved and locked. Nothing was changed. An admin can undo the approval.' }, { status: 403 });

  const group = await prisma.changeOrderOptionGroup.findUnique({
    where: { id: params.groupId },
    include: { lineItems: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  });
  if (!group || group.changeOrderId !== params.coId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body  = await req.json().catch(() => ({}));
  const rates = await (await import('@/lib/changeOrderRates')).getProjectRates(params.id);
  const { action = 'add_line', afterItemId, parentLineItemId: bodyParentId } = body;

  // Auto-calculate CN from DN + margin
  let cnUnitPrice = body.cnUnitPrice ?? 0;
  if (body.originalDN != null && rates.marginPct != null) {
    const factor = 1 - rates.marginPct;
    if (factor > 0) cnUnitPrice = cents(body.originalDN / factor);
  }

  const items = group.lineItems;

  // Opens a row after a line. sortOrder is a whole number, so later rows move down one.
  const openRowAfter = async (after) => {
    await prisma.changeOrderLineItem.updateMany({
      where: { optionGroupId: params.groupId, sortOrder: { gt: after.sortOrder } },
      data:  { sortOrder: { increment: 1 } },
    });
    return after.sortOrder + 1;
  };

  // ── Action: add_fee, a restocking fee tied to the credit it came from ──────
  if (action === 'add_fee') {
    const credit = items.find(i => i.id === afterItemId);
    if (!credit || !(credit.qty < 0)) {
      return NextResponse.json({ error: 'A restocking fee sits on a credit, and this line is not one. Nothing was added. Give the line a negative quantity first, then add the fee. (CO_FEE_NEEDS_CREDIT)' }, { status: 400 });
    }
    const fee = await prisma.changeOrderLineItem.create({
      data: {
        optionGroupId:    params.groupId,
        sortOrder:        await openRowAfter(credit),
        fixtureType:      credit.fixtureType,
        qty:              1,
        manufacturer:     credit.manufacturer,
        description:      'Restocking fee',
        originalDN:       body.originalDN ?? null,
        cnUnitPrice,
        isFee:            true,
        feeForLineId:     credit.id,
        isOptionRow:      false,
        isGroupSelected:  false,
      },
    });
    return NextResponse.json(fee, { status: 201 });
  }

  // ── Action: add_option, convert a line into Option A and add Option B ──────
  if (action === 'add_option') {
    const parentId = bodyParentId || afterItemId;
    const parentItem = items.find(i => i.id === parentId);
    if (!parentItem) return NextResponse.json({ error: 'Parent item not found' }, { status: 404 });

    // Find the true root of this group (parentLineItemId = null within the group)
    const rootId = parentItem.parentLineItemId || parentItem.id;
    const rootItem = items.find(i => i.id === rootId);

    // Count existing options in this group (root + its children)
    const groupSiblings = items.filter(i => i.id === rootId || i.parentLineItemId === rootId);

    // If root is not yet an option row, make it Option A
    if (rootItem && !rootItem.isOptionRow) {
      await prisma.changeOrderLineItem.update({
        where: { id: rootId },
        data: { isOptionRow: true, optionLabel: 'Option A', isGroupSelected: true },
      });
    }

    const nextLabel = `Option ${OPTION_LETTERS[groupSiblings.length] || String(groupSiblings.length + 1)}`;

    // Insert after the last member of this group
    const lastInGroup = groupSiblings.sort((a, b) => b.sortOrder - a.sortOrder)[0];
    const newSortOrder = lastInGroup ? lastInGroup.sortOrder + 0.5 : (rootItem?.sortOrder ?? 0) + 0.5;

    const newItem = await prisma.changeOrderLineItem.create({
      data: {
        optionGroupId:    params.groupId,
        sortOrder:        newSortOrder,
        fixtureType:      rootItem?.fixtureType || '',
        qty:              rootItem?.qty ?? 0,
        isOptionRow:      true,
        parentLineItemId: rootId,
        optionLabel:      nextLabel,
        isGroupSelected:  false,
        cnUnitPrice:      0,
      },
    });

    return NextResponse.json(newItem, { status: 201 });
  }

  // ── Action: add_line, add a plain new line after afterItemId ───────────────
  const afterItem = afterItemId ? items.find(i => i.id === afterItemId) : null;
  const nextOrder = afterItem
    ? await openRowAfter(afterItem)
    : (items.length > 0 ? Math.max(...items.map(i => i.sortOrder)) + 1 : 0);

  // Picked from the budget: the server reads where the product stands now, so Was and Now
  // and the billing compare against the record, not against what the browser sent.
  let fromBudget = {};
  if (body.fromType) {
    const product = (await coProducts(params.id)).find(p => p.key === productKey(body.fromType));
    if (!product) {
      return NextResponse.json({ error: `${body.fromType} is not on this job's budget or change orders, so no line was added. Reload the page and pick again. (CO_NO_PRODUCT)` }, { status: 400 });
    }
    const { qty, unitCost, manufacturer, partNumber, description } = product.now;
    const margin = rates.marginPct != null && rates.marginPct < 1 ? rates.marginPct : null;
    const sell = product.now.unitPrice ?? (unitCost != null && margin != null ? cents(unitCost / (1 - margin)) : 0);
    fromBudget = {
      fixtureType: product.type, qty: 0, manufacturer, partNumber, description, originalDN: unitCost, cnUnitPrice: sell,
      fromBudget: true, wasFixtureType: product.type, wasQty: qty, wasUnitPrice: sell, wasUnitCost: unitCost,
      wasManufacturer: manufacturer, wasPartNumber: partNumber, wasDescription: description, creditTaxPct: product.taxPct,
    };
  }

  const item = await prisma.changeOrderLineItem.create({
    data: {
      optionGroupId:    params.groupId,
      sortOrder:        nextOrder,
      fixtureType:      body.fixtureType    || '',
      qty:              body.qty            ?? 0,
      manufacturer:     body.manufacturer   || null,
      partNumber:       body.partNumber     || null,
      description:      body.description    || null,
      originalDN:       body.originalDN     ?? null,
      cnUnitPrice,
      quoteReference:   body.quoteReference || null,
      leadTime:         body.leadTime       || null,
      notes:            body.notes          || null,
      isOptionRow:      false,
      isGroupSelected:  false,
      ...fromBudget,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
