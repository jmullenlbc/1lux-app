import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAccessProject as canAccess } from '@/lib/submittalTracker';

// GET, fetch full tracker with all items, submissions, versions, reviews.
// Archived items, rounds and reviews are left out (0146); ?archived=1 lists
// them on their own so they can be restored.
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const live = { archivedAt: null };
  const tracker = await prisma.submittalTracker.findUnique({
    where: { projectId: params.id },
    include: {
      submissions: { where: live, orderBy: { createdAt: 'asc' } },
      items: {
        where: live,
        orderBy: { sortOrder: 'asc' },
        include: {
          versions: {
            where: { submission: live },
            orderBy: { createdAt: 'asc' },
            include: {
              submission: true,
              reviews: { where: live, orderBy: { createdAt: 'asc' }, include: { response: true } },
            },
          },
        },
      },
    },
  });

  let archived;
  if (tracker && new URL(request.url).searchParams.get('archived') === '1') {
    const gone = { archivedAt: { not: null } };
    const [items, submissions, reviews] = await Promise.all([
      prisma.submittalItem.findMany({ where: { trackerId: tracker.id, ...gone }, orderBy: { archivedAt: 'desc' } }),
      prisma.submittalSubmission.findMany({ where: { trackerId: tracker.id, ...gone }, orderBy: { archivedAt: 'desc' } }),
      prisma.submittalReview.findMany({
        where: { version: { item: { trackerId: tracker.id } }, ...gone },
        orderBy: { archivedAt: 'desc' },
        include: { version: { select: { item: { select: { typeCode: true } }, submission: { select: { name: true } } } } },
      }),
    ]);
    archived = { items, submissions, reviews };
  }

  return NextResponse.json({ tracker, archived });
}

// POST, create tracker for this project
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { specSection, reviewerRoles } = body;

  const tracker = await prisma.submittalTracker.create({
    data: {
      projectId: params.id,
      specSection: specSection || null,
      reviewerRoles: reviewerRoles
        ? JSON.stringify(reviewerRoles)
        : JSON.stringify(['ILC', 'Developer', 'Architect', 'LA', 'ID', 'EE']),
    },
  });

  return NextResponse.json({ tracker }, { status: 201 });
}

// PATCH, update tracker settings (reviewer roles, spec section)
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { specSection, reviewerRoles } = body;

  const tracker = await prisma.submittalTracker.update({
    where: { projectId: params.id },
    data: {
      ...(specSection    !== undefined && { specSection }),
      ...(reviewerRoles  !== undefined && { reviewerRoles: JSON.stringify(reviewerRoles) }),
    },
  });

  return NextResponse.json({ tracker });
}
