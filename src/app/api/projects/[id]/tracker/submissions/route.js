import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendNotification } from '@/lib/notify';
import { trackerFor as getTracker } from '@/lib/submittalTracker';

// POST, create a new submission round
// Body: { name, submittedDate, notes, specs: [{itemId, manufacturer, modelNumber}] }
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const tracker = await getTracker(params.id, user);
  if (!tracker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { name, submittedDate, notes, specs = [] } = await request.json();

  // Every spec must point at a live item on this project's tracker.
  const itemIds = [...new Set(specs.map((s) => s.itemId))];
  const ours = await prisma.submittalItem.count({ where: { id: { in: itemIds }, trackerId: tracker.id, archivedAt: null } });
  if (ours !== itemIds.length) {
    return NextResponse.json({ error: 'One or more fixture types are not on this tracker (or were archived). Nothing was saved. Reload the tracker and try again. (TRACKER_SPEC_ITEM)' }, { status: 400 });
  }

  const submission = await prisma.submittalSubmission.create({
    data: {
      trackerId:     tracker.id,
      name:          name || `Submission ${Date.now()}`,
      submittedDate: submittedDate || null,
      notes:         notes || null,
    },
  });

  // Create a version snapshot for each item that's included in this submission
  if (specs.length > 0) {
    await prisma.$transaction(
      specs.map(s =>
        prisma.submittalItemVersion.create({
          data: {
            itemId:       s.itemId,
            submissionId: submission.id,
            manufacturer: s.manufacturer || null,
            modelNumber:  s.modelNumber  || null,
          },
        })
      )
    );
  }

  const full = await prisma.submittalSubmission.findUnique({
    where: { id: submission.id },
    include: {
      versions: { include: { item: true, reviews: true } },
    },
  });

  // SUBMITTAL_WITH_COMMENTS if notes present, otherwise SUBMITTAL_UPLOADED
  const notifType = notes ? 'SUBMITTAL_WITH_COMMENTS' : 'SUBMITTAL_UPLOADED';
  sendNotification(params.id, notifType, { submissionName: submission.name }).catch(() => {});

  return NextResponse.json({ submission: full }, { status: 201 });
}
