import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const items = await prisma.peerReviewItem.findMany({
    where:   { projectId: params.id },
    orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json({ items });
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const {
    section = 'units', typeCode, description, location = '', notes = '',
    specManufacturer, specModel, specDetails,
    qty, prevQty, qtyType = 'unit', altChoices,
    propManufacturer, propModel, propUnitDN, propUnitPrice,
    repName, repEmail, rfqStatus,
    unitSavings, totalSavings, sortOrder = 0,
  } = body;

  const item = await prisma.peerReviewItem.create({
    data: {
      projectId: params.id,
      section, location, notes, sortOrder,
      typeCode:         typeCode         ?? null,
      description:      description      ?? null,
      specManufacturer: specManufacturer ?? null,
      specModel:        specModel        ?? null,
      specDetails:      specDetails      ?? null,
      qty:              qty              != null ? Number(qty)          : null,
      prevQty:          prevQty          != null ? Number(prevQty)      : null,
      qtyType:          qtyType          ?? 'unit',
      altChoices:       altChoices       ?? null,
      propManufacturer: propManufacturer ?? null,
      propModel:        propModel        ?? null,
      propUnitDN:       propUnitDN       != null ? Number(propUnitDN)   : null,
      propUnitPrice:    propUnitPrice    != null ? Number(propUnitPrice): null,
      repName:          repName          ?? null,
      repEmail:         repEmail         ?? null,
      rfqStatus:        rfqStatus        ?? null,
      unitSavings:      unitSavings      != null ? Number(unitSavings)  : null,
      totalSavings:     totalSavings     != null ? Number(totalSavings) : null,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
