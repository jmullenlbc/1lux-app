import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function authorizeClient(clientId, user) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && client.createdById !== user.id)
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { client };
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await authorizeClient(params.id, user);
  if (err) return err;

  const sections = await prisma.clientKBSection.findMany({
    where: { clientId: params.id },
    orderBy: { sortOrder: 'asc' },
    include: { attachments: { orderBy: { createdAt: 'asc' } } },
  });

  return NextResponse.json({ sections });
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await authorizeClient(params.id, user);
  if (err) return err;

  const body = await request.json().catch(() => ({}));
  const count = await prisma.clientKBSection.count({ where: { clientId: params.id } });

  const section = await prisma.clientKBSection.create({
    data: {
      clientId: params.id,
      title: body.title || 'Untitled Section',
      content: body.content || '',
      sortOrder: count,
    },
    include: { attachments: true },
  });

  return NextResponse.json({ section }, { status: 201 });
}
