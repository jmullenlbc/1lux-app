import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQcObjectUrl, deleteQcObject } from '@/lib/qcStorage';

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
  reporter: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
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

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!isSuperAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await prisma.bugReport.findUnique({
    where:  { id: params.id },
    select: { id: true, screenshotKey: true, recordingKey: true },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Best-effort S3 cleanup before the DB delete. deleteQcObject never throws,
  // so an orphan blob doesn't block removing the row from the board.
  if (existing.screenshotKey) await deleteQcObject(existing.screenshotKey);
  if (existing.recordingKey)  await deleteQcObject(existing.recordingKey);

  await prisma.bugReport.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
