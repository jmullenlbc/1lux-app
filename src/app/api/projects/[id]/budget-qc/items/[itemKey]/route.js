import { NextResponse } from 'next/server';
import { requireAuth, isSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { BUDGET_QC_ITEMS } from '@/lib/budgetQCItems';

// PATCH /api/projects/[id]/budget-qc/items/[itemKey]
// Check or uncheck a single item. Only assignee or ILC_ADMIN can call this.
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { checked, note } = await req.json();

  // Validate itemKey
  const def = BUDGET_QC_ITEMS.find(i => i.key === params.itemKey);
  if (!def) return NextResponse.json({ error: 'Unknown item key' }, { status: 400 });

  // Load checklist to check assignee
  const checklist = await prisma.budgetQCChecklist.findUnique({
    where: { projectId: params.id },
    select: { id: true, assignedToId: true },
  });
  if (!checklist) return NextResponse.json({ error: 'Checklist not found, load the QC strip first' }, { status: 404 });

  // Permission: ILC_ADMIN or assigned reviewer
  const isAdmin = isSuperAdmin(user.role) || user.role === 'SUPER_ADMIN';
  if (!isAdmin && checklist.assignedToId && checklist.assignedToId !== user.id) {
    return NextResponse.json({ error: 'Only the assigned reviewer can check items' }, { status: 403 });
  }

  const data = checked
    ? { checked: true,  checkedById: user.id, checkedAt: new Date(), note: note || null }
    : { checked: false, checkedById: null,    checkedAt: null,       note: null };

  const item = await prisma.budgetQCItem.upsert({
    where:  { checklistId_itemKey: { checklistId: checklist.id, itemKey: params.itemKey } },
    create: { checklistId: checklist.id, itemKey: params.itemKey, ...data },
    update: data,
  });

  return NextResponse.json({ item });
}
