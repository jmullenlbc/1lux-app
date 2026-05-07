import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function getClientOrFail(id, user) {
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && client.createdById !== user.id) {
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { client };
}

// GET /api/clients/[id]
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { client, err } = await getClientOrFail(params.id, user);
  if (err) return err;

  const full = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      projects: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, projectNumber: true, name: true, location: true, city: true, state: true,
          buildingType: true, phase: true, budgetType: true,
          status: true, createdAt: true, updatedAt: true,
        },
      },
      createdBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ client: full });
}

// PATCH /api/clients/[id]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await getClientOrFail(params.id, user);
  if (err) return err;

  const body = await request.json();
  const {
    name, type, locationType, notes,
    email, phone, website, address, city, state,
    linkedIn, primaryContact, primaryContactTitle,
    primaryContactEmail, primaryContactPhone,
    tier, markets, developerType, orgTypes,
  } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: 'Client name cannot be empty' }, { status: 400 });
  }

  const updated = await prisma.client.update({
    where: { id: params.id },
    data: {
      ...(name                !== undefined && { name: name.trim() }),
      ...(type                !== undefined && { type }),
      ...(locationType        !== undefined && { locationType }),
      ...(notes               !== undefined && { notes: notes || null }),
      ...(email               !== undefined && { email: email || null }),
      ...(phone               !== undefined && { phone: phone || null }),
      ...(website             !== undefined && { website: website || null }),
      ...(address             !== undefined && { address: address || null }),
      ...(city                !== undefined && { city: city || null }),
      ...(state               !== undefined && { state: state || null }),
      ...(linkedIn            !== undefined && { linkedIn: linkedIn || null }),
      ...(primaryContact      !== undefined && { primaryContact: primaryContact || null }),
      ...(primaryContactTitle !== undefined && { primaryContactTitle: primaryContactTitle || null }),
      ...(primaryContactEmail !== undefined && { primaryContactEmail: primaryContactEmail || null }),
      ...(primaryContactPhone !== undefined && { primaryContactPhone: primaryContactPhone || null }),
      ...(tier                !== undefined && { tier: tier || null }),
      ...(markets             !== undefined && { markets: JSON.stringify(markets) }),
      ...(developerType       !== undefined && { developerType: developerType || null }),
      ...(orgTypes            !== undefined && { orgTypes: JSON.stringify(orgTypes) }),
    },
  });

  return NextResponse.json({ client: updated });
}

// DELETE /api/clients/[id]
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await getClientOrFail(params.id, user);
  if (err) return err;

  // Unlink projects first (set clientId = null)
  await prisma.project.updateMany({
    where: { clientId: params.id },
    data:  { clientId: null },
  });

  await prisma.client.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
