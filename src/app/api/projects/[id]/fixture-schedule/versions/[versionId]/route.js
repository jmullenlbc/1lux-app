import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/projects/[id]/fixture-schedule/versions/[versionId]
// Rename a published fixture schedule version (submissionTag only — state/version are immutable)
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
    return NextResponse.json({ error: 'Cannot delete the draft — clear it instead' }, { status: 400 });

  // Delete cascade handles FixtureScheduleItems
  await prisma.fixtureSchedule.delete({ where: { id: params.versionId } });
  return NextResponse.json({ ok: true });
}
