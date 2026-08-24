import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  return isSuperAdmin(user.role) || p.createdById === user.id;
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { name, submittedDate, notes } = await request.json();
  const submission = await prisma.submittalSubmission.update({
    where: { id: params.submissionId },
    data: {
      ...(name          !== undefined && { name }),
      ...(submittedDate !== undefined && { submittedDate }),
      ...(notes         !== undefined && { notes }),
    },
  });
  return NextResponse.json({ submission });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.submittalSubmission.delete({ where: { id: params.submissionId } });
  return NextResponse.json({ success: true });
}
