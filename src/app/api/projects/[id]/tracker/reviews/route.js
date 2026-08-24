import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  return isSuperAdmin(user.role) || p.createdById === user.id;
}

// POST — add a review entry to a specific item version
// Body: { versionId, reviewerRole, reviewerName, status, dateNoted, notes }
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { versionId, reviewerRole, reviewerName, status, dateNoted, notes } = await request.json();

  const validStatuses = ['Approved', 'ApprovedAsNoted', 'Resubmit', 'NoAction'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const review = await prisma.submittalReview.create({
    data: {
      versionId,
      reviewerRole,
      reviewerName: reviewerName || null,
      status,
      dateNoted:    dateNoted || null,
      notes:        notes     || null,
      createdById:  user.id,
    },
  });

  return NextResponse.json({ review }, { status: 201 });
}
