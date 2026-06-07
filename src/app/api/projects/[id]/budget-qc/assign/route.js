import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/projects/[id]/budget-qc/assign
// Assign a reviewer to the checklist. ILC_ADMIN only.
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN';
  if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { userId } = await req.json();

  // Upsert checklist so assign works even before first GET
  const checklist = await prisma.budgetQCChecklist.upsert({
    where:  { projectId: params.id },
    create: { projectId: params.id, assignedToId: userId || null },
    update: { assignedToId: userId || null },
    include: { assignedTo: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ checklist });
}
