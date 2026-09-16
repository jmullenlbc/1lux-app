import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// One person's access history, newest first (migration 0086,
// src/lib/accessEvents.js). Shown in the Edit User window.
export async function GET(request, { params }) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const events = await prisma.userAccessEvent.findMany({
    where:   { userId: params.id },
    orderBy: { changedAt: 'desc' },
    take:    200,
    select: {
      id: true, kind: true, field: true, fromValue: true, toValue: true, changedAt: true,
      changedBy: { select: { name: true, email: true } },
    },
  });
  return NextResponse.json(events);
}
