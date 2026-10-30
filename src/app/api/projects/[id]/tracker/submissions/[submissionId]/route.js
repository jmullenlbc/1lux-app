import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { changedFields, logHistory } from '@/lib/recordHistory';
import { trackerFor, ownedSubmission } from '@/lib/submittalTracker';

const FIELDS = ['name', 'submittedDate', 'notes'];

// PATCH, edit a round. { archived: false } restores an archived one.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await trackerFor(params.id, user);
  const before = tracker && await ownedSubmission(tracker.id, params.submissionId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  if (body.archived === false) {
    const submission = await prisma.submittalSubmission.update({ where: { id: before.id }, data: { archivedAt: null } });
    await logHistory({ entityType: 'SUBMITTAL_SUBMISSION', entityId: before.id, action: 'RESTORE', user });
    return NextResponse.json({ submission });
  }
  const data = Object.fromEntries(FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
  const submission = await prisma.submittalSubmission.update({ where: { id: before.id }, data });
  const changes = changedFields(before, submission, FIELDS);
  if (Object.keys(changes).length) await logHistory({ entityType: 'SUBMITTAL_SUBMISSION', entityId: before.id, action: 'UPDATE', user, changes });
  return NextResponse.json({ submission });
}

// DELETE archives the round (0146). Its reviews and responses stay.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await trackerFor(params.id, user);
  const submission = tracker && await ownedSubmission(tracker.id, params.submissionId);
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!submission.archivedAt) {
    await prisma.submittalSubmission.update({ where: { id: submission.id }, data: { archivedAt: new Date() } });
    await logHistory({ entityType: 'SUBMITTAL_SUBMISSION', entityId: submission.id, action: 'ARCHIVE', user, note: submission.name });
  }
  return NextResponse.json({ success: true, archived: true });
}
