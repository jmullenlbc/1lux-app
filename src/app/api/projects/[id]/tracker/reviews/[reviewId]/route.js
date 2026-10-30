import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { changedFields, logHistory } from '@/lib/recordHistory';
import { REVIEW_STATUS_CODES, categorizeNote } from '@/lib/submittalStatus';
import { trackerFor, ownedReview, roundOf, syncOpenItems } from '@/lib/submittalTracker';

const FIELDS = ['reviewerRole', 'reviewerName', 'status', 'dateNoted', 'notes'];

// PATCH, fix a review (0146). { archived: false } restores an archived one.
// A new status or note runs the open items again for that type.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await trackerFor(params.id, user);
  const before = tracker && await ownedReview(tracker.id, params.reviewId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  if (body.archived === false) {
    const review = await prisma.submittalReview.update({ where: { id: before.id }, data: { archivedAt: null } });
    await logHistory({ entityType: 'SUBMITTAL_REVIEW', entityId: before.id, action: 'RESTORE', user });
    return NextResponse.json({ review });
  }
  if (body.status !== undefined && !REVIEW_STATUS_CODES.includes(body.status)) {
    return NextResponse.json({ error: 'Pick a status: Approved, Approved as noted, Rejected or Not reviewed. Nothing was saved. (TRACKER_REVIEW_STATUS)' }, { status: 400 });
  }
  if (body.reviewerRole !== undefined && !String(body.reviewerRole).trim()) {
    return NextResponse.json({ error: 'Pick who reviewed it. Nothing was saved. (TRACKER_REVIEW_ROLE)' }, { status: 400 });
  }

  const data = Object.fromEntries(FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k] === '' && k !== 'reviewerRole' ? null : body[k]]));
  if (data.notes !== undefined) data.noteCategory = data.notes ? categorizeNote(data.notes) : null;
  const review = await prisma.submittalReview.update({ where: { id: before.id }, data });

  const changes = changedFields(before, review, FIELDS);
  if (Object.keys(changes).length) {
    await logHistory({ entityType: 'SUBMITTAL_REVIEW', entityId: before.id, action: 'UPDATE', user, changes });
    if (changes.status || changes.notes) {
      await syncOpenItems({
        projectId: params.id,
        round: await roundOf(tracker.id, before.version.submission),
        reviews: [{ ...review, typeCode: before.version.item.typeCode }],
      });
    }
  }
  return NextResponse.json({ review });
}

// DELETE archives the review (0146); its response stays with it.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await trackerFor(params.id, user);
  const review = tracker && await ownedReview(tracker.id, params.reviewId);
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!review.archivedAt) {
    await prisma.submittalReview.update({ where: { id: review.id }, data: { archivedAt: new Date() } });
    await logHistory({ entityType: 'SUBMITTAL_REVIEW', entityId: review.id, action: 'ARCHIVE', user, note: `${review.version.item.typeCode} ${review.reviewerRole}` });
  }
  return NextResponse.json({ success: true, archived: true });
}
