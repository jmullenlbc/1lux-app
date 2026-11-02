import { NextResponse } from 'next/server';
import { requireAuth, requirePermission, isClientViewer } from '@/lib/auth';
import { createTaxChangeCO, taxChangePreview } from '@/lib/changeOrderTaxChange';

// GET /api/projects/[id]/change-orders/tax-change?newPct=0.0845&date=2025-07-01&base=
// What a tax only change order would hold, before it is made.
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const preview = await taxChangePreview(params.id, { newPct: Number(q.get('newPct')), date: q.get('date'), base: q.get('base') });
  if (preview.error) return NextResponse.json({ error: preview.error }, { status: 400 });
  return NextResponse.json(preview);
}

// POST body: { newPct, date, base? }. Makes a draft change order; it still goes through send and approve.
export async function POST(req, { params }) {
  const { user, error } = await requirePermission(req, 'editJobMoney');
  if (error) return error;

  const { newPct, date, base } = await req.json().catch(() => ({}));
  const res = await createTaxChangeCO(params.id, { newPct: Number(newPct), date, base, user });
  if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res.co, { status: 201 });
}
