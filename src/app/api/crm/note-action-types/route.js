import { NextResponse } from 'next/server';
import { requireAuth, requireSalesAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAllActionTypes } from '@/lib/noteActionTypesStore';
import { EXECUTORS } from '@/lib/noteActions';

export const dynamic = 'force-dynamic';

// GET — list the taxonomy. ?active=1 → active only (for the note dropdown).
// Any authenticated user can read; only admins can edit (POST/PATCH/DELETE).
export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const types = await getAllActionTypes();
  const activeOnly = new URL(request.url).searchParams.get('active') === '1';
  return NextResponse.json({ types: activeOnly ? types.filter(t => t.isActive) : types });
}

// POST — create a new type (admin)
export async function POST(request) {
  const { error } = await requireSalesAdmin();
  if (error) return error;

  const b = await request.json();
  const key = String(b.key || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (!key)          return NextResponse.json({ error: 'key required' }, { status: 400 });
  if (!b.label)      return NextResponse.json({ error: 'label required' }, { status: 400 });
  const executor = EXECUTORS.includes(b.executor) ? b.executor : 'OTHER';

  const exists = await prisma.noteActionType.findUnique({ where: { key } });
  if (exists) return NextResponse.json({ error: 'A type with that key already exists' }, { status: 409 });

  const created = await prisma.noteActionType.create({
    data: {
      key,
      label:        String(b.label),
      executor,
      kind:         b.kind === 'INTEL' ? 'INTEL' : 'ACTION',
      description:  b.description || null,
      emailTemplate: b.emailTemplate || null,
      instructions: b.instructions || null,
      reminderDays: b.reminderDays === '' || b.reminderDays == null ? null : Number(b.reminderDays),
      sortOrder:    Number.isFinite(+b.sortOrder) ? +b.sortOrder : 0,
      isActive:     b.isActive !== false,
    },
  });
  return NextResponse.json({ type: created });
}

// PATCH — update a type (admin). Body: { key, ...fields }
export async function PATCH(request) {
  const { error } = await requireSalesAdmin();
  if (error) return error;

  const b = await request.json();
  if (!b.key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const data = {};
  if (b.label        !== undefined) data.label        = String(b.label);
  if (b.executor     !== undefined) data.executor     = EXECUTORS.includes(b.executor) ? b.executor : 'OTHER';
  if (b.kind         !== undefined) data.kind         = b.kind === 'INTEL' ? 'INTEL' : 'ACTION';
  if (b.description  !== undefined) data.description  = b.description || null;
  if (b.emailTemplate!== undefined) data.emailTemplate = b.emailTemplate || null;
  if (b.instructions !== undefined) data.instructions = b.instructions || null;
  if (b.reminderDays !== undefined) data.reminderDays = (b.reminderDays === '' || b.reminderDays == null) ? null : Number(b.reminderDays);
  if (b.sortOrder    !== undefined) data.sortOrder    = Number.isFinite(+b.sortOrder) ? +b.sortOrder : 0;
  if (b.isActive     !== undefined) data.isActive     = !!b.isActive;

  const updated = await prisma.noteActionType.update({ where: { key: b.key }, data });
  return NextResponse.json({ type: updated });
}

// DELETE — remove a type (admin). ?key=XXX
export async function DELETE(request) {
  const { error } = await requireSalesAdmin();
  if (error) return error;
  const key = new URL(request.url).searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  await prisma.noteActionType.delete({ where: { key } });
  return NextResponse.json({ ok: true });
}
