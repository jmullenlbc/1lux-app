import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { INCLUDE_ARCHIVED } from '@/lib/archive';

// PATCH /api/projects/[id]/fixture-schedule/versions/[versionId]
// Rename a published fixture schedule version (submissionTag only, state/version are immutable)
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { submissionTag } = await req.json();

  const schedule = await prisma.fixtureSchedule.findUnique({ where: { id: params.versionId } });
  if (!schedule || schedule.projectId !== params.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (schedule.state === 'DRAFT')
    return NextResponse.json({ error: 'Cannot rename the draft' }, { status: 400 });

  const updated = await prisma.fixtureSchedule.update({
    where: { id: params.versionId },
    data:  { submissionTag: submissionTag?.trim() || null },
  });
  return NextResponse.json({ schedule: updated });
}

// DELETE /api/projects/[id]/fixture-schedule/versions/[versionId]
// Delete a published fixture schedule version
export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const schedule = await prisma.fixtureSchedule.findUnique({ where: { id: params.versionId } });
  if (!schedule || schedule.projectId !== params.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (schedule.state === 'DRAFT')
    return NextResponse.json({ error: 'Cannot delete the draft, clear it instead' }, { status: 400 });

  // Delete cascade handles FixtureScheduleItems
  // Deleting a schedule version took every budget version built from it with
  // it, and budgets are archive-only (Mike, 2026-09-11). Archived ones count.
  const budgetCount = await prisma.designBidMatrix.count({ where: { sourceScheduleId: params.versionId, ...INCLUDE_ARCHIVED } });
  if (budgetCount > 0) {
    return NextResponse.json({
      error: `${budgetCount} budget version${budgetCount === 1 ? ' was' : 's were'} built from this schedule. Budgets are never deleted, so the schedule has to stay too.`,
    }, { status: 409 });
  }
  await prisma.fixtureSchedule.delete({ where: { id: params.versionId } });
  return NextResponse.json({ ok: true });
}
