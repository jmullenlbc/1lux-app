import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getKnowledgeFileBuffer } from '@/lib/botKnowledge/storage';
import { extractDocumentText } from '@/lib/botKnowledge/extract';

export const runtime     = 'nodejs';
export const maxDuration = 300;

// POST /api/automation/knowledge/docs/[id]/reread — read a stored file again.
//
// The file is always kept, even when reading it failed, precisely so this is
// possible. Without it, a file that failed for a reason we have since fixed
// could only be recovered by deleting it and dropping it in again — which is
// exactly what happened when the live Bot Knowledge screen shipped without
// pdfjs's worker in its Lambda and every PDF failed to open (2026-09-08).
//
// Mirrors /api/projects/[id]/files/[fileId]/reparse, which exists for the same
// reason on the drawings side.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existing = await prisma.botKnowledgeDoc.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const buffer = await getKnowledgeFileBuffer(existing.storedPath);
  if (!buffer) {
    return NextResponse.json(
      { error: 'The stored file could not be found, so there is nothing to read again. Upload it once more.' },
      { status: 404 },
    );
  }

  const result = await extractDocumentText(buffer, existing.fileName, existing.mimeType);

  const doc = await prisma.botKnowledgeDoc.update({
    where: { id: params.id },
    data: {
      fileType:   result.fileType || existing.fileType,
      text:       result.text || null,
      charCount:  (result.text || '').length,
      pageCount:  result.pageCount ?? null,
      status:     result.status,
      statusNote: result.note || null,
    },
    select: {
      id: true, category: true, title: true, description: true, fileName: true,
      fileType: true, sizeBytes: true, charCount: true, pageCount: true,
      status: true, statusNote: true, isActive: true, createdAt: true,
    },
  });

  return NextResponse.json({ doc });
}
