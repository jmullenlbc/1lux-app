import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/knowledge-base/categories/[id]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const isAdmin = ['ILC_ADMIN', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(user.role);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await request.json();
    const data = {};
    if (body.label    !== undefined) data.label    = body.label.trim();
    if (body.desc     !== undefined) data.desc     = body.desc.trim();
    if (body.color    !== undefined) data.color    = body.color;
    if (body.icon     !== undefined) data.icon     = body.icon;
    if (body.position !== undefined) data.position = body.position;

    const cat = await prisma.kbCategory.update({ where: { id: params.id }, data });
    return NextResponse.json(cat);
  } catch (err) {
    console.error('[categories PATCH]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

// DELETE /api/knowledge-base/categories/[id]
// Moves all entries in this category to UNCATEGORIZED, then deletes the category.
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const isAdmin = ['ILC_ADMIN', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(user.role);
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const cat = await prisma.kbCategory.findUnique({ where: { id: params.id } });
    if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (cat.isBuiltIn) return NextResponse.json({ error: 'Built-in categories cannot be deleted' }, { status: 400 });

    // Ensure UNCATEGORIZED exists (it should always be seeded, but guard anyway)
    await prisma.kbCategory.upsert({
      where:  { key: 'UNCATEGORIZED' },
      update: {},
      create: { key: 'UNCATEGORIZED', label: 'Uncategorized', desc: 'Standards not yet assigned to a category', color: 'slate', icon: '📁', position: 999, isBuiltIn: true },
    });

    // Move all entries to UNCATEGORIZED
    const moved = await prisma.designStandard.updateMany({
      where: { category: cat.key },
      data:  { category: 'UNCATEGORIZED' },
    });

    await prisma.kbCategory.delete({ where: { id: params.id } });

    return NextResponse.json({ ok: true, moved: moved.count });
  } catch (err) {
    console.error('[categories DELETE]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
