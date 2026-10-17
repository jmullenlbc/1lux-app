import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { projectScopeWhere } from '@/lib/projectScope';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/projects/createProject';

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Projects are visible to all ILC staff (Mike, 2026-07). External Client Viewers
  // stay scoped to their own — never widen this to CLIENT_VIEWER.
  const where = projectScopeWhere(user);

  const projects = await prisma.project.findMany({
    where,
    include: {
      projectData: true,
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { responses: true } },
      conceptualDraft: { select: { budgetName: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ projects });
}

export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  if (isClientViewer(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  // Numbering, frozen pricing, default margin and the "created" history line
  // all live in createProject — shared with "create from a web request".
  const project = await createProject(prisma, user.id, body);

  return NextResponse.json({ project }, { status: 201 });
}
