import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/[id]/rfis/summary
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const now   = new Date();
  const month = new Date(now.getFullYear(), now.getMonth(), 1);

  const [open, overdue, draftReady, closedThisMonth] = await Promise.all([
    prisma.rFI.count({ where: { projectId: params.id, status: { not: 'CLOSED' } } }),
    prisma.rFI.count({ where: { projectId: params.id, status: { not: 'CLOSED' }, dateDue: { lt: now } } }),
    prisma.rFI.count({ where: { projectId: params.id, draftStatus: 'READY' } }),
    prisma.rFI.count({ where: { projectId: params.id, status: 'CLOSED', closedAt: { gte: month } } }),
  ]);

  return NextResponse.json({ open, overdue, draftReady, closedThisMonth });
}
