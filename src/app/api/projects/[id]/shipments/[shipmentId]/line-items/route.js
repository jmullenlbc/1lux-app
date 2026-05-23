import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/projects/[id]/shipments/[shipmentId]/line-items
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const shipment = await prisma.shipment.findFirst({
    where: { id: params.shipmentId, project_id: params.id },
  });
  if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { fixtureType, description, catalogNo, qty, fixtureStatus, notes, submittalItemId } = body;

  if (!fixtureType?.trim() || !description?.trim()) {
    return NextResponse.json({ error: 'fixtureType and description required' }, { status: 400 });
  }

  const item = await prisma.shipmentLineItem.create({
    data: {
      shipment_id:    params.shipmentId,
      fixtureType:    fixtureType.trim(),
      description:    description.trim(),
      catalogNo:      catalogNo    || null,
      qty:            qty          ?? 1,
      fixtureStatus:  fixtureStatus || null,
      notes:          notes         || null,
      submittalItemId: submittalItemId || null,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
