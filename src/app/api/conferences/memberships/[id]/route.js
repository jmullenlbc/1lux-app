import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { MEMBERSHIP_INCLUDE } from '@/lib/conferences/constants';
import { canEditConferences } from '@/lib/conferences/server';

export const dynamic = 'force-dynamic';

const bad = (error) => NextResponse.json({ error }, { status: 400 });

// PATCH: turn a membership on, off or automatic, and set its dues.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canEditConferences(user)) return NextResponse.json({ error: 'Only a Sales Admin can change the conference plan.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return bad('The change did not come through. Nothing was saved. Try again.');
  const found = await prisma.conferenceMembership.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!found) return NextResponse.json({ error: 'This membership is not in the plan. Nothing was saved.' }, { status: 404 });

  const data = {};
  if (body.include !== undefined) {
    if (!MEMBERSHIP_INCLUDE.some(m => m.key === body.include)) return bad('Pick Yes, No or Automatic.');
    data.include = body.include;
  }
  if (body.annualDues !== undefined) {
    const n = body.annualDues === '' || body.annualDues === null ? null : Number(body.annualDues);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return bad('Type dues of 0 or more, or leave them blank.');
    data.annualDuesCents = n === null ? null : Math.round(cents(n) * 100);
  }
  if (body.notes !== undefined) data.notes = String(body.notes || '').trim() || null;

  await prisma.conferenceMembership.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}
