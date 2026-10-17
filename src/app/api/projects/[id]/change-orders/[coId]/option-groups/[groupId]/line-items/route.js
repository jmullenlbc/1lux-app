import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';

const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// POST, add line item to group
// body.action: 'add_line' | 'add_option'
// body.afterItemId: insert after this item ID
// body.parentLineItemId: for add_option, the root of the group
export async function POST(req, { params }) {
  const { error } = await requirePermission(req, 'editJobMoney'); // Construction, Operations, Finance, admins
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'CO is locked' }, { status: 403 });

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
    if (factor > 0) cnUnitPrice = Math.round((body.originalDN / factor) * 100) / 100;
  }

  const items = group.lineItems;

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
    ? afterItem.sortOrder + 0.5
    : (items.length > 0 ? Math.max(...items.map(i => i.sortOrder)) + 1 : 0);

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
    },
  });

  return NextResponse.json(item, { status: 201 });
}
