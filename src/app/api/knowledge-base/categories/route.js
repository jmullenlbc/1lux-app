import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/knowledge-base/categories
export async function GET(request) {
  const { error } = await requireAuth(request);
  if (error) return error;

  const cats = await prisma.kbCategory.findMany({ orderBy: [{ position: 'asc' }, { label: 'asc' }] });
  return NextResponse.json(cats);
}

// POST /api/knowledge-base/categories
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const isAdmin = ['ILC_ADMIN', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(user.role);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { label, desc, color, icon } = await request.json();
    if (!label?.trim()) return NextResponse.json({ error: 'Label is required' }, { status: 400 });

    // Derive a unique key from the label
    const baseKey = label.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    let key = baseKey;
    let suffix = 2;
    while (await prisma.kbCategory.findUnique({ where: { key } })) {
      key = `${baseKey}_${suffix++}`;
    }

    const last = await prisma.kbCategory.findFirst({ where: { isBuiltIn: false }, orderBy: { position: 'desc' } });
    const position = (last?.position ?? -1) + 1;

    const cat = await prisma.kbCategory.create({
      data: { key, label: label.trim(), desc: desc?.trim() ?? '', color: color ?? 'slate', icon: icon ?? '📁', position },
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (err) {
    console.error('[categories POST]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}
