import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readFile } from 'fs/promises';
import path from 'path';

// GET — serve a drawing file inline (for PDF viewer)
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

  try {
    const buffer      = await readFile(path.join(process.cwd(), 'uploads', file.storedPath));
    const contentType = file.mimeType || 'application/pdf';
    return new Response(buffer, {
      headers: {
        'Content-Type':        contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
        'Content-Length':      String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }
}
