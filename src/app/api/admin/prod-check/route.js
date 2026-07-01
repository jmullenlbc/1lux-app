import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth';

export async function GET(request) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  const rows = await prisma.meetingNote.findMany({
    include: { project: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(rows);
}
