import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

function canEdit(user) {
  if (['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'].includes(user.role)) return true;
  try { return JSON.parse(user.permissions || '{}').knowledgeBase === true; } catch { return false; }
}

// GET /api/knowledge-base  — list standards (optional ?category=, ?q= search)
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const q        = searchParams.get('q');

  const where = { isActive: true };
  if (category) where.category = category.toUpperCase();
  if (q) where.OR = [
    { title:   { contains: q } },
    { content: { contains: q } },
    { tags:    { contains: q } },
  ];

  const standards = await prisma.designStandard.findMany({
    where,
    orderBy: [{ category: 'asc' }, { severity: 'asc' }, { createdAt: 'asc' }],
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });

  // Also return category counts for the landing page
  const counts = await prisma.designStandard.groupBy({
    by: ['category'],
    where: { isActive: true },
    _count: { id: true },
  });

  return NextResponse.json({ standards, counts, canEdit: canEdit(user) });
}

// POST /api/knowledge-base  — create a standard
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canEdit(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { category, title, content, severity = 'REQUIRED', tags = [], sourceUrl } = body;

  if (!category || !title || !content) {
    return NextResponse.json({ error: 'category, title and content are required' }, { status: 400 });
  }

  const standard = await prisma.designStandard.create({
    data: {
      category:    category.toUpperCase(),
      title:       title.trim(),
      content:     content.trim(),
      severity:    severity.toUpperCase(),
      tags:        JSON.stringify(Array.isArray(tags) ? tags : []),
      sourceUrl:   sourceUrl || null,
      createdById: user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(standard, { status: 201 });
}
