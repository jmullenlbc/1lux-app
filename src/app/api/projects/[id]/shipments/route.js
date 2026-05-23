import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deriveShipmentStatus } from '@/lib/shipmentStatus';

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  return user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'COMPANY_ADMIN' || p.createdById === user.id;
}

// GET /api/projects/[id]/shipments
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const shipments = await prisma.shipment.findMany({
    where: { project_id: params.id },
    include: { lineItems: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(shipments);
}

// POST /api/projects/[id]/shipments
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { manufacturer, poDate, leadTimeWeeks, esdDate, trackingNumber, deliveredDate, notes } = body;

  if (!manufacturer?.trim()) {
    return NextResponse.json({ error: 'manufacturer required' }, { status: 400 });
  }

  const status = deriveShipmentStatus({ poDate, leadTimeWeeks, esdDate, trackingNumber, deliveredDate });

  const shipment = await prisma.shipment.create({
    data: {
      project_id: params.id,
      manufacturer: manufacturer.trim(),
      poDate: poDate ? new Date(poDate) : null,
      leadTimeWeeks: leadTimeWeeks || null,
      esdDate: esdDate ? new Date(esdDate) : null,
      trackingNumber: trackingNumber || null,
      deliveredDate: deliveredDate ? new Date(deliveredDate) : null,
      notes: notes || null,
      status,
    },
    include: { lineItems: true },
  });

  return NextResponse.json(shipment, { status: 201 });
}
