import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
import { logActivity, TAB_LABELS } from '@/lib/activity';
import { archiveData, readArchivedFlag, deleteRefused, ARCHIVED_FLAG_HELP } from '@/lib/archive';

// GET, serve the file inline (for PDF viewer)
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const record = await prisma.projectFile.findUnique({
    where: { id: params.fileId },
    include: { project: true },
  });

  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && record.project.createdById !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const buffer = await getProjectFileBuffer(record.storedPath);
  if (!buffer) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  return new Response(buffer, {
    headers: {
      'Content-Type':        record.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(record.originalName)}"`,
      'Content-Length':      String(buffer.length),
    },
  });
}

export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const record = await prisma.projectFile.findUnique({
    where: { id: params.fileId },
    include: { project: true },
  });

  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && record.project.createdById !== user.id) {
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
  const data = {
    constructionStartDate: start,
    mepRoughInDate:        mep,
    constructionEndDate:   end,
  };
  try {
    await prisma.project.update({ where: { id: record.projectId }, data });
  } catch (e) { console.error('[milestone edit date sync] failed:', e?.message ?? e); }

  return NextResponse.json({ file });
}

// Project files are archived, never deleted (Mike, 2026-09-11: "yes drawings
// and budgets and products should be archive only"). Migration 0076. The stored
// file is kept, so the GET above still serves an archived one and a restored
// file opens exactly as before.
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Project files') }, { status: 405 });
}

// POST /api/projects/[id]/files/[fileId]  { archived: true | false }
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const record = await prisma.projectFile.findUnique({
    where: { id: params.fileId },
    include: { project: true },
  });

  if (!record || record.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && record.project.createdById !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const file = await prisma.projectFile.update({
    where: { id: params.fileId },
    data:  archiveData(archived, user),
  });

  const tabLabel = TAB_LABELS[record.tab] || record.tab;
  await logActivity(
    record.projectId,
    user,
    archived ? 'file_archive' : 'file_restore',
    archived ? `Archived **${record.originalName}** from ${tabLabel}` : `Restored **${record.originalName}** to ${tabLabel}`,
    { fileName: record.originalName, tab: record.tab },
  );

  return NextResponse.json({ file });
}
