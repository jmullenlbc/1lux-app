import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { INCLUDE_ARCHIVED } from '@/lib/archive';
import { getProjectRates, chosenLineItems } from '@/lib/changeOrderRates';

// POST /api/projects/[id]/change-orders/[coId]/push-to-budget
// Creates a new DesignBidMatrix version containing ONLY the CO's line items.
// This produces a standalone bid snapshot for PO/RFQ purposes.
// Does NOT include pricing, DN/CN are carried if they exist on line items.

export async function POST(req, { params }) {
  const { user, error } = await requirePermission(req, 'editJobMoney'); // Construction, Operations, Finance, admins
  if (error) return error;

  try {
  const co = await prisma.changeOrder.findUnique({
    where: { id: params.coId },
    include: {
      optionGroups: {
        orderBy: { sortOrder: 'asc' },
        include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
      },
      project: { select: { serviceType: true, name: true } },
    },
  });
  if (!co || co.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only the chosen option, with per line alternates resolved to the one picked
  if (!co.optionGroups.some(g => g.isSelected)) {
    return NextResponse.json({ error: 'No option is chosen on this change order, so nothing was pushed. Choose one and try again.' }, { status: 400 });
  }
  const allLineItems = chosenLineItems(co);
  if (allLineItems.length === 0) {
    return NextResponse.json({ error: 'CO has no line items' }, { status: 400 });
  }

  // Version number: next after last CO-sourced or standard matrix
  const lastMatrix = await prisma.designBidMatrix.findFirst({
    where:   { projectId: params.id, ...INCLUDE_ARCHIVED },
    orderBy: { version: 'desc' },
  });
  const nextVersion = (lastMatrix?.version ?? 0) + 1;
  const matrixType  = ['peerReview', 'bidOnly'].includes(co.project.serviceType) ? 'PEER_REVIEW' : 'DESIGN_BID';

  // Build bid matrix items from CO line items
  // Note: sourceItemId is a FK to FixtureScheduleItem, do NOT set it from CO items
  const bidItems = allLineItems.map((li, idx) => ({
    type:          li.fixtureType  || '',
    description:   li.description  || '',
    locationTag:   null,
    manufacturer:  li.manufacturer || null,
    partNumber:    li.partNumber   || null,
    qty:           li.qty > 0 ? Math.round(li.qty) : null,
    qtyType:       'Unit',
    dnPerUnit:     li.originalDN   ?? null,
    cnPerUnit:     li.cnUnitPrice  ?? null,
    notes:         li.notes        || null,
    internalNotes: null,
    sortOrder:     idx,
    // sourceItemId intentionally omitted, CO items are not FixtureScheduleItems
  }));

  // We need a fixtureSchedule as sourceScheduleId, use or create a stub
  // (DesignBidMatrix requires a sourceScheduleId FK)
  let stubSchedule = await prisma.fixtureSchedule.findFirst({
    where: { projectId: params.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!stubSchedule) {
    stubSchedule = await prisma.fixtureSchedule.create({
      data: { projectId: params.id, state: 'PUBLISHED', version: 0, publishedAt: new Date(), publishedById: user.id },
    });
  }

  const matrix = await prisma.designBidMatrix.create({
    data: {
      projectId:        params.id,
      sourceScheduleId: stubSchedule.id,
      version:          nextVersion,
      pushedById:       user.id,
      submissionTag:    `${co.coNumber}: ${co.title}`,
      matrixType,
      changeSummary:    JSON.stringify({ source: 'change_order', coId: co.id, coNumber: co.coNumber }),
      // This version is only the CO's lines, so it keeps the CO's sales tax
      salesTaxPct:      co.salesTaxPct ?? (await getProjectRates(params.id)).salesTaxPct,
      items: { create: bidItems },
    },
    include: {
      items:    { orderBy: [{ sortOrder: 'asc' }] },
      pushedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ matrix, version: nextVersion }, { status: 201 });
  } catch (err) {
    console.error('[push-to-budget]', err?.message ?? err);
    return NextResponse.json({ error: err?.message || 'Failed to create budget version' }, { status: 500 });
  }
}
