import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

function isSuperAdmin(user) {
  return ['SUPER_ADMIN', 'ILC_ADMIN'].includes(user.role);
}

function canEdit(user) {
  if (actsAsAdmin(user)) return true;
  try { return JSON.parse(user.permissions || '{}').knowledgeBase === true; } catch { return false; }
}

// GET /api/knowledge-base, list standards (optional ?category=?q= search)
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const q        = searchParams.get('q');

  const where = { isActive: true };
  // Non-super-admins cannot see superAdminOnly entries
  if (!isSuperAdmin(user)) where.superAdminOnly = false;
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

  // Category counts also respect visibility
  const counts = await prisma.designStandard.groupBy({
    by: ['category'],
    where: { isActive: true, ...(isSuperAdmin(user) ? {} : { superAdminOnly: false }) },
    _count: { id: true },
  });

  return NextResponse.json({ standards, counts, canEdit: canEdit(user), isSuperAdmin: isSuperAdmin(user) });
}

// POST /api/knowledge-base, create a standard
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!canEdit(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { category, title, content, severity = 'REQUIRED', tags = [], sourceUrl, superAdminOnly = false } = body;

  if (!category || !title || !content) {
    return NextResponse.json({ error: 'category, title and content are required' }, { status: 400 });
  }

  // Only super admins can create super-admin-only entries
  const saOnly = superAdminOnly && isSuperAdmin(user);

  const standard = await prisma.designStandard.create({
    data: {
      category:       category.toUpperCase(),
      title:          title.trim(),
      content:        content.trim(),
      severity:       severity.toUpperCase(),
      tags:           JSON.stringify(Array.isArray(tags) ? tags : []),
      sourceUrl:      sourceUrl || null,
      superAdminOnly: saOnly,
      createdById:    user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(standard, { status: 201 });
}
