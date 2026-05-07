import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import path from 'path';
import { logActivity, TAB_LABELS } from '@/lib/activity';

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const record = await prisma.projectFile.findUnique({
    where: { id: params.fileId },
    include: { project: true },
  });

  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && record.project.createdById !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();

  // Only milestones patching is supported for now
  if (!body.milestones || !Array.isArray(body.milestones)) {
    return NextResponse.json({ error: 'milestones array required' }, { status: 400 });
  }

  // Preserve any existing takeoffData fields other than milestones
  let existing = {};
  try { existing = JSON.parse(record.takeoffData || '{}'); } catch {}
  const updated = { ...existing, milestones: body.milestones };

  const file = await prisma.projectFile.update({
    where: { id: params.fileId },
    data:  { takeoffData: JSON.stringify(updated) },
  });

  // Sync legacy project-level date columns so the project card stays current.
  // Rough-in entries may have -N suffixes (multi-phase); pick the earliest dated one.
  const get = (id) => body.milestones.find(m => m.id === id)?.date ?? null;
  const getEarliest = (prefix) => {
    const dates = body.milestones
      .filter(m => m.id === prefix || m.id.startsWith(prefix + '-'))
      .map(m => m.date).filter(Boolean).sort();
    return dates[0] ?? null;
  };
  const start = get('construction-start');
  const mep   = getEarliest('mep-rough');
  const end   = get('construction-end');
  const cols = [], vals = [];
  if (start !== undefined) { cols.push('"constructionStartDate" = ?'); vals.push(start); }
  if (mep   !== undefined) { cols.push('"mepRoughInDate" = ?');        vals.push(mep); }
  if (end   !== undefined) { cols.push('"constructionEndDate" = ?');   vals.push(end); }
  if (cols.length > 0) {
    try {
      vals.push(record.projectId);
      await prisma.$executeRawUnsafe(`UPDATE "Project" SET ${cols.join(', ')} WHERE "id" = ?`, ...vals);
    } catch {}
  }

  return NextResponse.json({ file });
}

export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const record = await prisma.projectFile.findUnique({
    where: { id: params.fileId },
    include: { project: true },
  });

  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && record.project.createdById !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await unlink(path.join(process.cwd(), 'uploads', record.storedPath));
  } catch {
    // file already gone from disk — still delete the DB record
  }

  await prisma.projectFile.delete({ where: { id: params.fileId } });

  const tabLabel = TAB_LABELS[record.tab] || record.tab;
  await logActivity(
    record.projectId,
    user,
    'file_delete',
    `Deleted **${record.originalName}** from ${tabLabel}`,
    { fileName: record.originalName, tab: record.tab },
  );

  return NextResponse.json({ ok: true });
}
