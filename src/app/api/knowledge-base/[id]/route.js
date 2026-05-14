import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

function canEdit(user) {
  if (['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'].includes(user.role)) return true;
  try { return JSON.parse(user.permissions || '{}').knowledgeBase === true; } catch { return false; }
}

// PATCH /api/knowledge-base/[id]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canEdit(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { category, title, content, severity, tags, sourceUrl } = body;

  const data = { updatedById: user.id };
  if (category  !== undefined) data.category  = category.toUpperCase();
  if (title     !== undefined) data.title      = title.trim();
  if (content   !== undefined) data.content    = content.trim();
  if (severity  !== undefined) data.severity   = severity.toUpperCase();
  if (tags      !== undefined) data.tags       = JSON.stringify(Array.isArray(tags) ? tags : []);
  if (sourceUrl !== undefined) data.sourceUrl  = sourceUrl || null;

  const standard = await prisma.designStandard.update({
    where: { id: params.id },
    data,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(standard);
}

// DELETE /api/knowledge-base/[id]  — soft delete
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canEdit(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await prisma.designStandard.update({
    where: { id: params.id },
    data: { isActive: false, updatedById: user.id },
  });

  return NextResponse.json({ ok: true });
}
