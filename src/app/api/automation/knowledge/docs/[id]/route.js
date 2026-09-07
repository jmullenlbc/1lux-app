import { NextResponse } from 'next/server';
import { requireAuth, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deleteKnowledgeFile } from '@/lib/botKnowledge/storage';

// GET — one document, including the extracted text so a human can check what
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

// PATCH — title, description, category, active flag. The extracted text is not
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

// DELETE — admin only, matching the Q&A entries, and this one really removes
// the file as well. Anyone who just wants it out of the bot's way should set
// isActive false instead.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!isAnyAdmin(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await prisma.botKnowledgeDoc.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  await deleteKnowledgeFile(existing.storedPath);
  await prisma.botKnowledgeDoc.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
