import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET, get current share link(s) for this project's fixture schedule
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const share = await prisma.fixtureScheduleShare.findFirst({
    where: { projectId: params.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ share: share || null });
}

// POST, create or regenerate a share link
// Body: { permission: 'view' | 'edit' }
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const permission = body.permission === 'edit' ? 'edit' : 'view';

  // Delete existing shares for this project (one link at a time)
  await prisma.fixtureScheduleShare.deleteMany({ where: { projectId: params.id } });

  const share = await prisma.fixtureScheduleShare.create({
    data: {
      projectId:   params.id,
      permission,
      createdById: user.id,
    },
  });

  return NextResponse.json({ share });
}

// DELETE, revoke the share link
export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  await prisma.fixtureScheduleShare.deleteMany({ where: { projectId: params.id } });
  return NextResponse.json({ ok: true });
}
