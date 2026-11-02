import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canEditConferences, currentPlan } from '@/lib/conferences/server';

export const dynamic = 'force-dynamic';

const bad = (error) => NextResponse.json({ error }, { status: 400 });

// POST: add a membership to this year's plan. Whoever adds one means to count
// it, so it starts on Yes.
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canEditConferences(user)) return NextResponse.json({ error: 'Only a Sales Admin can change the conference plan.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const orgName = String(body?.orgName || '').trim();
  if (!orgName) return bad('Type the name of the membership. Nothing was saved.');

  const plan = await currentPlan();
  if (!plan) return bad('The conference plan is not loaded yet. An admin needs to load it on the Admin page first. Nothing was saved.');

  const names = await prisma.conferenceMembership.findMany({ where: { year: plan.year }, select: { orgName: true } });
  if (names.some(m => m.orgName.toLowerCase() === orgName.toLowerCase())) return bad(`${orgName} is already on the ${plan.year} list. Nothing was saved.`);

  const made = await prisma.conferenceMembership.create({ data: { year: plan.year, orgName, include: 'Y' } });
  return NextResponse.json({ ok: true, id: made.id });
}
