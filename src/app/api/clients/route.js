import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/clients — list all clients (admin sees all, user sees own)
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'ADMIN';

  const clients = await prisma.client.findMany({
    where: isAdmin ? {} : { createdById: user.id },
    orderBy: { clientNumber: 'asc' },
    include: {
      _count: { select: { projects: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ clients });
}

// POST /api/clients — create a client
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const {
    name, type, locationType, notes,
    email, phone, website, address, city, state,
    linkedIn, primaryContact, primaryContactTitle,
    primaryContactEmail, primaryContactPhone,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Client name is required' }, { status: 400 });
  }

  // Generate next clientNumber
  const agg = await prisma.client.aggregate({ _max: { clientNumber: true } });
  const clientNumber = (agg._max.clientNumber ?? 0) + 1;

  const client = await prisma.client.create({
    data: {
      clientNumber,
      name:         name.trim(),
      type:         type         || null,
      locationType: locationType || 'standalone',
      notes:        notes        || null,
      email:        email        || null,
      phone:        phone        || null,
      website:      website      || null,
      address:      address      || null,
      city:         city         || null,
      state:        state        || null,
      linkedIn:     linkedIn     || null,
      primaryContact:      primaryContact      || null,
      primaryContactTitle: primaryContactTitle || null,
      primaryContactEmail: primaryContactEmail || null,
      primaryContactPhone: primaryContactPhone || null,
      createdById:  user.id,
    },
  });

  return NextResponse.json({ client }, { status: 201 });
}
