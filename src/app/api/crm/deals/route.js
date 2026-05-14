import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function nextDealNumber() {
  const max = await prisma.deal.aggregate({ _max: { dealNumber: true } });
  return (max._max.dealNumber ?? 0) + 1;
}

// GET /api/crm/deals
// Query params: pipeline, dealStatus, serviceType, projectType, ownerId, search
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const pipeline    = searchParams.get('pipeline');    // PROCUREMENT | DESIGN | null (all)
  const dealStatus  = searchParams.get('dealStatus');  // OPEN | WON | LOST | ON_HOLD | null
  const serviceType = searchParams.get('serviceType');
  const projectType = searchParams.get('projectType');
  const ownerId     = searchParams.get('ownerId');
  const search      = searchParams.get('search');

  const where = {};
  if (pipeline)    where.pipeline    = pipeline;
  if (dealStatus)  where.dealStatus  = dealStatus;
  if (serviceType) where.serviceType = serviceType;
  if (projectType) where.projectType = projectType;
  if (ownerId)     where.ownerId     = ownerId;
  if (search) {
    where.OR = [
      { title:        { contains: search } },
      { notes:        { contains: search } },
      { client:       { name: { contains: search } } },
    ];
  }

  const deals = await prisma.deal.findMany({
    where,
    orderBy: [{ dealStatus: 'asc' }, { updatedAt: 'desc' }],
    include: {
      client:  { select: { id: true, clientNumber: true, name: true, type: true } },
      owner:   { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      linkedProject: { select: { id: true, projectNumber: true, name: true, phase: true } },
      linkedDeal:    { select: { id: true, dealNumber: true, title: true, pipeline: true } },
      contacts: {
        include: {
          contact: { select: { id: true, contactNumber: true, name: true, title: true, email: true } },
        },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 1,  // only latest activity for card display
      },
      _count: { select: { activities: true, contacts: true } },
    },
  });

  return NextResponse.json({ deals });
}

// POST /api/crm/deals
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const {
    title, pipeline, stage, dealStatus = 'OPEN', designStatus = 'OPEN', projectStatus = 'ACTIVE',
    projectType, serviceType, totalRevenue, designFeeTotal, probability = 50,
    expectedOrderDate, notes, nextActionText, nextActionDue,
    clientId, ownerId, linkedDealId,
    city, state, buildingType, numberOfUnits,
    contacts = [],  // [{ contactId, role }]
  } = body;

  if (!title?.trim())    return NextResponse.json({ error: 'title is required' },    { status: 400 });
  if (!pipeline)         return NextResponse.json({ error: 'pipeline is required' }, { status: 400 });
  if (!stage)            return NextResponse.json({ error: 'stage is required' },    { status: 400 });

  // Validate that clientId, ownerId, linkedDealId are real IDs (not text)
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ error: 'clientId not found' }, { status: 400 });
  }
  if (ownerId) {
    const owner = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) return NextResponse.json({ error: 'ownerId not found' }, { status: 400 });
  }
  if (linkedDealId) {
    const ld = await prisma.deal.findUnique({ where: { id: linkedDealId } });
    if (!ld) return NextResponse.json({ error: 'linkedDealId not found' }, { status: 400 });
  }

  const dealNumber = await nextDealNumber();

  const deal = await prisma.deal.create({
    data: {
      dealNumber,
      title:            title.trim(),
      pipeline,
      stage,
      dealStatus,
      designStatus,
      projectStatus,
      projectType:      projectType   || null,
      serviceType:      serviceType   || null,
      totalRevenue:     totalRevenue  != null ? Number(totalRevenue)  : null,
      designFeeTotal:   designFeeTotal != null ? Number(designFeeTotal) : null,
      probability:      probability   != null ? Number(probability)   : 50,
      expectedOrderDate: expectedOrderDate ? new Date(expectedOrderDate) : null,
      notes:            notes         || null,
      nextActionText:   nextActionText || null,
      nextActionDue:    nextActionDue  ? new Date(nextActionDue) : null,
      clientId:         clientId      || null,
      ownerId:          ownerId       || null,
      linkedDealId:     linkedDealId  || null,
      city:             city          || null,
      state:            state         || null,
      buildingType:     buildingType  || null,
      numberOfUnits:    numberOfUnits != null ? Number(numberOfUnits) : null,
      createdById:      user.id,
    },
    include: {
      client:  { select: { id: true, clientNumber: true, name: true } },
      owner:   { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  // Create DealContact junction records
  if (contacts.length > 0) {
    await prisma.dealContact.createMany({
      data: contacts.map(c => ({
        dealId:    deal.id,
        contactId: c.contactId,
        role:      c.role || 'OTHER',
      })),
      skipDuplicates: true,
    });
  }

  // Log creation activity
  await prisma.dealActivity.create({
    data: {
      dealId:   deal.id,
      userId:   user.id,
      userName: user.name || user.email,
      type:     'NOTE',
      body:     `Deal created in ${pipeline} pipeline · Stage: ${stage}`,
    },
  });

  // Re-fetch with contacts
  const full = await prisma.deal.findUnique({
    where: { id: deal.id },
    include: {
      client:        { select: { id: true, clientNumber: true, name: true, type: true } },
      owner:         { select: { id: true, name: true, email: true } },
      createdBy:     { select: { id: true, name: true } },
      linkedProject: { select: { id: true, projectNumber: true, name: true } },
      linkedDeal:    { select: { id: true, dealNumber: true, title: true, pipeline: true } },
      contacts: { include: { contact: { select: { id: true, contactNumber: true, name: true, title: true, email: true } } } },
      activities: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { activities: true, contacts: true } },
    },
  });

  return NextResponse.json(full, { status: 201 });
}
