import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET, one document, including the extracted text so a human can check what
// the bot is actually reading. That check matters: a scanned PDF can come back
// with plausible-looking OCR nonsense, and the only way to catch it is to look.
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const doc = await prisma.botKnowledgeDoc.findUnique({
    where:   { id: params.id },
    include: { createdBy: { select: { name: true, email: true } } },
  });
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  return NextResponse.json({ doc });
}

// PATCH, title, description, category, active flag. The extracted text is not
// editable here on purpose; it is a record of what was read out of the file.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existing = await prisma.botKnowledgeDoc.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const { title, description, category, isActive } = await request.json();

  const doc = await prisma.botKnowledgeDoc.update({
    where: { id: params.id },
    data: {
      ...(title       !== undefined && { title: String(title).trim() || existing.fileName }),
      ...(description !== undefined && { description: description ? String(description).trim() : null }),
      ...(category    !== undefined && { category: String(category).trim() || 'GENERAL' }),
      ...(isActive    !== undefined && { isActive: Boolean(isActive) }),
    },
    select: {
      id: true, category: true, title: true, description: true, fileName: true,
      fileType: true, sizeBytes: true, charCount: true, pageCount: true,
      status: true, statusNote: true, isActive: true, createdAt: true,
    },
  });

  return NextResponse.json({ doc });
}

/**
 * Files in the bot's library are archived, never deleted.
 *
 * Mike, 2026-09-10. This one matters more than the Q&A entries: deleting a
 * document also deleted the file itself out of storage, so a spec or a drawing
 * somebody uploaded months earlier was gone with no copy anywhere.
 *
 * Archiving takes it out of the bot's reach (retrieve.js filters on isActive)
 * and keeps all three things: the record, the text pulled out of the file, and
 * the file itself.
 *
 * Refuses rather than being removed, so nothing that still remembers this URL
 * can destroy a file by calling it.
 */
export async function DELETE() {
  const { error } = await requireAuth();
  if (error) return error;

  return NextResponse.json({
    error: 'Files in the bot library are archived, never deleted. Archive it instead. That takes it out of the bot and keeps the file.',
  }, { status: 405 });
}

