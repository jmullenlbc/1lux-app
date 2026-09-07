import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getKnowledgeFileUrl, getKnowledgeFileBuffer } from '@/lib/botKnowledge/storage';

export const runtime = 'nodejs';

// Hand back the original file somebody dropped on the page.
//
// In prod that is a redirect to a short-lived signed S3 link, so the file never
// travels through the Lambda. In dev the file sits on disk, so it is streamed
// straight back.
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const doc = await prisma.botKnowledgeDoc.findUnique({
    where:  { id: params.id },
    select: { storedPath: true, fileName: true, mimeType: true },
  });
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const signed = await getKnowledgeFileUrl(doc.storedPath);
  if (signed) return NextResponse.redirect(signed);

  const buffer = await getKnowledgeFileBuffer(doc.storedPath);
  if (!buffer) {
    return NextResponse.json({ error: 'The file itself could not be found. It may have been removed from storage.' }, { status: 404 });
  }

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        doc.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${doc.fileName.replace(/"/g, '')}"`,
      'Content-Length':      String(buffer.length),
    },
  });
}
