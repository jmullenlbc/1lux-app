import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQcObjectUrl } from '@/lib/qcStorage';
import { archiveData, readArchivedFlag, ARCHIVED_FLAG_HELP, deleteRefused } from '@/lib/archive';

function isSuperAdmin(user) {
  return ['SUPER_ADMIN', 'ILC_ADMIN'].includes(user.role);
}

async function serialize(r) {
  return {
    ...r,
    consoleJson:   JSON.parse(r.consoleJson  || '[]'),
    networkJson:   JSON.parse(r.networkJson  || '[]'),
    pageStateJson: r.pageStateJson ? JSON.parse(r.pageStateJson) : null,
    screenshotUrl: r.screenshotKey ? await getQcObjectUrl(r.screenshotKey) : null,
  };
}

const INCLUDE = {
  reporter:   { select: { id: true, name: true, email: true } },
  assignee:   { select: { id: true, name: true, email: true } },
  archivedBy: { select: { id: true, name: true, email: true } },
};

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const report = await prisma.bugReport.findUnique({ where: { id: params.id }, include: INCLUDE });
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(await serialize(report));
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!isSuperAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const data = {};
  if (body.status     !== undefined) data.status     = body.status;
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;

  const report = await prisma.bugReport.update({
    where: { id: params.id },
    data,
    include: INCLUDE,
  });

  return NextResponse.json(await serialize(report));
}

// Archive or restore: { archived: true | false }. Bug reports are archived,
// never deleted (Mike, 2026-09-12). The row, the screenshot and the recording
// in S3 all stay; an archived report just leaves the board until restored.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!isSuperAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const existing = await prisma.bugReport.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const report = await prisma.bugReport.update({
    where: { id: params.id },
    data: archiveData(archived, user),
    include: INCLUDE,
  });

  return NextResponse.json(await serialize(report));
}

export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Bug reports') }, { status: 405 });
}
