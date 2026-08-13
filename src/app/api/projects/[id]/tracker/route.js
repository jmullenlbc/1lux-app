import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  return isSuperAdmin(user.role) || p.createdById === user.id;
}

// GET — fetch full tracker with all items, submissions, versions, reviews
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const tracker = await prisma.submittalTracker.findUnique({
    where: { projectId: params.id },
    include: {
      submissions: { orderBy: { createdAt: 'asc' } },
      items: {
        orderBy: { sortOrder: 'asc' },
        include: {
          versions: {
            orderBy: { createdAt: 'asc' },
            include: {
              submission: true,
              reviews: { orderBy: { createdAt: 'asc' }, include: { response: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ tracker });
}

// POST — create tracker for this project
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

// PATCH — update tracker settings (reviewer roles, spec section)
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
