import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const DEAL_INCLUDE = {
  client:        { select: { id: true, clientNumber: true, name: true, type: true } },
  owner:         { select: { id: true, name: true, email: true } },
  createdBy:     { select: { id: true, name: true } },
  linkedProject: { select: { id: true, projectNumber: true, name: true, phase: true, serviceType: true } },
  linkedDeal:    { select: { id: true, dealNumber: true, title: true, pipeline: true, stage: true } },
  contacts: {
    include: {
      contact: {
        select: { id: true, contactNumber: true, name: true, title: true, email: true, phone: true, clientId: true,
                  client: { select: { id: true, clientNumber: true, name: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  activities: {
    orderBy: { createdAt: 'desc' },
    take: 50,
  },
  _count: { select: { activities: true, contacts: true } },
};

// GET /api/crm/deals/[id]
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const deal = await prisma.deal.findUnique({ where: { id: params.id }, include: DEAL_INCLUDE });
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(deal);
}

// PATCH /api/crm/deals/[id]
// Handles field updates + stage/status changes (auto-logs activity)
// Special fields: dealStatus = 'WON' sets wonAt; 'LOST' sets lostAt
// Special: linkedProjectId can be set to link/unlink a project (must be real Project ID)
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const deal = await prisma.deal.findUnique({ where: { id: params.id } });
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const {
    title, pipeline, stage, dealStatus, designStatus, projectStatus,
    projectType, serviceType, totalRevenue, designFeeTotal, probability,
    expectedOrderDate, notes, nextActionText, nextActionDue,
    clientId, ownerId, linkedDealId, linkedProjectId,
    lostReason,
    // Project-identity fields
    city, state, buildingType, numberOfUnits,
    // Contact management
    addContacts = [],    // [{ contactId, role }]
    removeContacts = [], // [contactId]
  } = body;

  // Validate FK IDs — nothing connected by text
  if (clientId !== undefined && clientId !== null) {
    const c = await prisma.client.findUnique({ where: { id: clientId } });
    if (!c) return NextResponse.json({ error: 'clientId not found' }, { status: 400 });
  }
  if (ownerId !== undefined && ownerId !== null) {
    const o = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!o) return NextResponse.json({ error: 'ownerId not found' }, { status: 400 });
  }
  if (linkedProjectId !== undefined && linkedProjectId !== null) {
    const p = await prisma.project.findUnique({ where: { id: linkedProjectId } });
    if (!p) return NextResponse.json({ error: 'linkedProjectId not found' }, { status: 400 });
  }
  if (linkedDealId !== undefined && linkedDealId !== null) {
    const ld = await prisma.deal.findUnique({ where: { id: linkedDealId } });
    if (!ld) return NextResponse.json({ error: 'linkedDealId not found' }, { status: 400 });
  }

  // Build update data
  const data = {};
  if (title        !== undefined) data.title        = title.trim();
  if (pipeline     !== undefined) data.pipeline     = pipeline;
  if (projectType  !== undefined) data.projectType  = projectType  || null;
  if (serviceType  !== undefined) data.serviceType  = serviceType  || null;
  if (totalRevenue   !== undefined) data.totalRevenue   = totalRevenue   != null ? Number(totalRevenue)   : null;
  if (designFeeTotal !== undefined) data.designFeeTotal = designFeeTotal != null ? Number(designFeeTotal) : null;
  if (probability  !== undefined) data.probability  = Number(probability);
  if (notes        !== undefined) data.notes        = notes        || null;
  if (nextActionText !== undefined) data.nextActionText = nextActionText || null;
  if (nextActionDue  !== undefined) data.nextActionDue  = nextActionDue  ? new Date(nextActionDue) : null;
  if (expectedOrderDate !== undefined) data.expectedOrderDate = expectedOrderDate ? new Date(expectedOrderDate) : null;
  if (clientId      !== undefined) data.clientId      = clientId      || null;
  if (ownerId       !== undefined) data.ownerId       = ownerId       || null;
  if (linkedDealId  !== undefined) data.linkedDealId  = linkedDealId  || null;
  if (linkedProjectId !== undefined) data.linkedProjectId = linkedProjectId || null;
  // Project-identity fields
  if (city          !== undefined) data.city          = city          || null;
  if (state         !== undefined) data.state         = state         || null;
  if (buildingType  !== undefined) data.buildingType  = buildingType  || null;
  if (numberOfUnits !== undefined) data.numberOfUnits = numberOfUnits != null ? Number(numberOfUnits) : null;

  // ── Stage change → log activity ───────────────────────────────────────────
  const stageActivities = [];
  if (stage !== undefined && stage !== deal.stage) {
    data.stage = stage;
    stageActivities.push({
      dealId:   deal.id,
      userId:   user.id,
      userName: user.name || user.email,
      type:     'STAGE_CHANGE',
      body:     `Stage changed: ${deal.stage} → ${stage}`,
      metadata: JSON.stringify({ from: deal.stage, to: stage }),
    });
  }

  // ── Status change → log activity + set timestamps ────────────────────────
  if (dealStatus !== undefined && dealStatus !== deal.dealStatus) {
    data.dealStatus = dealStatus;
    if (dealStatus === 'WON')  data.wonAt  = new Date();
    if (dealStatus === 'LOST') {
      data.lostAt = new Date();
      if (lostReason !== undefined) data.lostReason = lostReason || null;
    }
    stageActivities.push({
      dealId:   deal.id,
      userId:   user.id,
      userName: user.name || user.email,
      type:     'STATUS_CHANGE',
      body:     dealStatus === 'LOST' && lostReason
        ? `Deal lost — reason: ${lostReason}`
        : `Status changed: ${deal.dealStatus} → ${dealStatus}`,
      metadata: JSON.stringify({ from: deal.dealStatus, to: dealStatus, lostReason: lostReason || null }),
    });
  }
  // Allow updating lostReason independently (e.g. editing after the fact)
  if (lostReason !== undefined && dealStatus === undefined) data.lostReason = lostReason || null;

  // ── Design status change → log activity ──────────────────────────────────
  if (designStatus !== undefined && designStatus !== deal.designStatus) {
    data.designStatus = designStatus;
    stageActivities.push({
      dealId:   deal.id,
      userId:   user.id,
      userName: user.name || user.email,
      type:     'STATUS_CHANGE',
      body:     `Design status changed: ${deal.designStatus} → ${designStatus}`,
      metadata: JSON.stringify({ from: deal.designStatus, to: designStatus, field: 'designStatus' }),
    });
  }
  if (projectStatus !== undefined && projectStatus !== deal.projectStatus) {
    data.projectStatus = projectStatus;
    stageActivities.push({
      dealId:   deal.id,
      userId:   user.id,
      userName: user.name || user.email,
      type:     'STATUS_CHANGE',
      body:     `Project status changed: ${deal.projectStatus} → ${projectStatus}`,
      metadata: JSON.stringify({ from: deal.projectStatus, to: projectStatus, field: 'projectStatus' }),
    });
  }

  // ── Pipeline change → log activity ───────────────────────────────────────
  if (pipeline !== undefined && pipeline !== deal.pipeline) {
    stageActivities.push({
      dealId:   deal.id,
      userId:   user.id,
      userName: user.name || user.email,
      type:     'STAGE_CHANGE',
      body:     `Pipeline changed: ${deal.pipeline} → ${pipeline}`,
      metadata: JSON.stringify({ from: deal.pipeline, to: pipeline, field: 'pipeline' }),
    });
  }

  // Run everything in a transaction
  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.deal.update({ where: { id: params.id }, data });
      }
      if (stageActivities.length > 0) {
        await tx.dealActivity.createMany({ data: stageActivities });
      }
      // Add contacts
      if (addContacts.length > 0) {
        await tx.dealContact.createMany({
          data: addContacts.map(c => ({ dealId: deal.id, contactId: c.contactId, role: c.role || 'OTHER' })),
          skipDuplicates: true,
        });
      }
      // Remove contacts
      if (removeContacts.length > 0) {
        await tx.dealContact.deleteMany({
          where: { dealId: deal.id, contactId: { in: removeContacts } },
        });
      }
    });
  } catch (err) {
    console.error('[PATCH /api/crm/deals] transaction error:', err);
    return NextResponse.json(
      { error: err?.message || 'Database error — check server logs' },
      { status: 500 }
    );
  }

  const updated = await prisma.deal.findUnique({ where: { id: params.id }, include: DEAL_INCLUDE });
  return NextResponse.json(updated);
}

// DELETE /api/crm/deals/[id]
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const isAdmin = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN', 'ADMIN'].includes(user.role);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const deal = await prisma.deal.findUnique({ where: { id: params.id } });
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.deal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
