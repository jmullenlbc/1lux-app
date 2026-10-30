import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logHistory } from '@/lib/recordHistory';
import { REVIEW_STATUS_CODES, categorizeNote } from '@/lib/submittalStatus';
import { trackerFor, ownedVersion, roundOf, syncOpenItems } from '@/lib/submittalTracker';

// POST, add a review entry to a specific item version
// Body: { versionId, reviewerRole, reviewerName, status, dateNoted, notes }
// A typed review opens or closes open items the same way a PDF read does (0146).
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await trackerFor(params.id, user);
  if (!tracker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { versionId, reviewerRole, reviewerName, status, dateNoted, notes } = await request.json();

  if (!REVIEW_STATUS_CODES.includes(status)) {
    return NextResponse.json({ error: 'Pick a status: Approved, Approved as noted, Rejected or Not reviewed. Nothing was saved. (TRACKER_REVIEW_STATUS)' }, { status: 400 });
  }
  if (!reviewerRole?.trim()) {
    return NextResponse.json({ error: 'Pick who reviewed it. Nothing was saved. (TRACKER_REVIEW_ROLE)' }, { status: 400 });
  }
  const version = await ownedVersion(tracker.id, versionId);
  if (!version) return NextResponse.json({ error: 'That fixture round is not on this tracker (or was archived). Nothing was saved. Reload and try again. (TRACKER_REVIEW_VERSION)' }, { status: 404 });

  const review = await prisma.submittalReview.create({
    data: {
      versionId:    version.id,
      reviewerRole: reviewerRole.trim(),
      reviewerName: reviewerName || null,
      status,
      dateNoted:    dateNoted || null,
      notes:        notes     || null,
      noteCategory: notes ? categorizeNote(notes) : null,
      createdById:  user.id,
    },
  });
  await logHistory({ entityType: 'SUBMITTAL_REVIEW', entityId: review.id, action: 'CREATE', user, note: `${version.item.typeCode} ${reviewerRole}` });

  await syncOpenItems({
    projectId: params.id,
    round: await roundOf(tracker.id, version.submission),
    reviews: [{ ...review, typeCode: version.item.typeCode }],
  });

  return NextResponse.json({ review }, { status: 201 });
}
