import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { serveStoredFile } from '@/lib/projectFileServe';

// GET, serve a drawing file inline (for PDF viewer)
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const file = await prisma.drawingFile.findUnique({
    where:   { id: params.fileId },
    include: { submission: { include: { project: true } } },
  });

  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const project = file.submission.project;
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return serveStoredFile(request, {
    storedPath: file.storedPath,
    name:       file.fileName,
    mimeType:   file.mimeType || 'application/pdf',
    size:       file.size,
  });
}
