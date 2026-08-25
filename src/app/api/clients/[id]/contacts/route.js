import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function authorizeClient(clientId, user) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canSeeAllData(user) && client.createdById !== user.id)
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { client };
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await authorizeClient(params.id, user);
  if (err) return err;

  const contacts = await prisma.clientContact.findMany({
    where: { clientId: params.id },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ contacts });
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await authorizeClient(params.id, user);
  if (err) return err;

  const { name, title, email, phone, department } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const contact = await prisma.clientContact.create({
    data: {
      clientId: params.id,
      name: name.trim(),
      title: title || null,
      email: email || null,
      phone: phone || null,
      department: department || null,
    },
  });

  return NextResponse.json({ contact }, { status: 201 });
}
