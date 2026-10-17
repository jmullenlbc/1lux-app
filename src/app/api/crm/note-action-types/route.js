import { NextResponse } from 'next/server';
import { requireAuth, requireSalesAdmin, isSalesTeam } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAllActionTypes } from '@/lib/noteActionTypesStore';
import { EXECUTORS } from '@/lib/noteActions';

export const dynamic = 'force-dynamic';

// GET, list the taxonomy. ?active=1 → active only (for the note dropdown).
// Any authenticated user can read; only admins can edit (POST/PATCH/DELETE).
export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const types = await getAllActionTypes();
  const activeOnly = new URL(request.url).searchParams.get('active') === '1';
  return NextResponse.json({ types: activeOnly ? types.filter(t => t.isActive) : types });
}

// POST, create a new type (admin)
// Reminder rungs: a whole number of days (1 to 3650), or blank for "no reminder".
// Anything else is dropped to blank rather than saved as NaN.
const days = v => {
  if (v === '' || v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? n : null;
};

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
      reminderDays: days(b.reminderDays),
      reminder2Days: days(b.reminder2Days),
      reminder3Days: days(b.reminder3Days),
      sortOrder:    Number.isFinite(+b.sortOrder) ? +b.sortOrder : 0,
      isActive:     b.isActive !== false,
    },
  });
  return NextResponse.json({ type: created });
}

// PATCH, update a type. Body: { key...fields }. The reminder days alone are
// open to the whole sales team (Mike 9-25); everything else is Sales Admin.
const TIMELINE_FIELDS = ['key', 'reminderDays', 'reminder2Days', 'reminder3Days'];
export async function PATCH(request) {
  const b = await request.json();
  if (Object.keys(b).every(k => TIMELINE_FIELDS.includes(k))) {
    const { user, error } = await requireAuth();
    if (error) return error;
    if (!isSalesTeam(user)) return NextResponse.json({ error: 'Only the sales team can change the reminder timeline.' }, { status: 403 });
  } else {
    const { error } = await requireSalesAdmin();
    if (error) return error;
  }

  if (!b.key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const data = {};
  if (b.label        !== undefined) data.label        = String(b.label);
  if (b.executor     !== undefined) data.executor     = EXECUTORS.includes(b.executor) ? b.executor : 'OTHER';
  if (b.kind         !== undefined) data.kind         = b.kind === 'INTEL' ? 'INTEL' : 'ACTION';
  if (b.description  !== undefined) data.description  = b.description || null;
  if (b.emailTemplate!== undefined) data.emailTemplate = b.emailTemplate || null;
  if (b.instructions !== undefined) data.instructions = b.instructions || null;
  if (b.reminderDays !== undefined) data.reminderDays = days(b.reminderDays);
  if (b.reminder2Days !== undefined) data.reminder2Days = days(b.reminder2Days);
  if (b.reminder3Days !== undefined) data.reminder3Days = days(b.reminder3Days);
  if (b.sortOrder    !== undefined) data.sortOrder    = Number.isFinite(+b.sortOrder) ? +b.sortOrder : 0;
  if (b.isActive     !== undefined) data.isActive     = !!b.isActive;

  const updated = await prisma.noteActionType.update({ where: { key: b.key }, data });
  return NextResponse.json({ type: updated });
}

// DELETE, remove a type (admin). ?key=XXX
export async function DELETE(request) {
  const { error } = await requireSalesAdmin();
  if (error) return error;
  const key = new URL(request.url).searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  await prisma.noteActionType.delete({ where: { key } });
  return NextResponse.json({ ok: true });
}
