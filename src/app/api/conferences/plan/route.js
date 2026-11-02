import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { DEFAULT_PLAN_SETTINGS, settingRowsFrom } from '@/lib/conferences/engine';
import { canEditConferences, currentPlan } from '@/lib/conferences/server';

export const dynamic = 'force-dynamic';

const bad = (error) => NextResponse.json({ error }, { status: 400 });
const DEFAULTS = new Map(settingRowsFrom(DEFAULT_PLAN_SETTINGS).map(r => [r.key, r.value]));

// PATCH: planning rules, budget cap and plan notes. A rule that matches the
// default keeps no row, so a later change to the default still reaches it.
export async function PATCH(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canEditConferences(user)) return NextResponse.json({ error: 'Only a Sales Admin can change the conference plan.' }, { status: 403 });

  const plan = await currentPlan();
  if (!plan) return bad('The conference list is not loaded yet. Nothing was saved. An admin loads it on the Conference Load page.');
  const body = await request.json().catch(() => null);
  if (!body) return bad('The change did not come through. Nothing was saved. Try again.');

  const data = {};
  if (body.budgetCap !== undefined) {
    const cap = body.budgetCap === '' || body.budgetCap === null ? null : Number(body.budgetCap);
    if (cap !== null && (!Number.isFinite(cap) || cap < 0)) return bad('Type a budget cap of 0 or more, or leave it blank.');
    data.budgetCapCents = cap === null ? null : Math.round(cents(cap) * 100);
  }
  if (body.notes !== undefined) data.notes = String(body.notes || '').trim() || null;

  let rows = null;
  if (body.settings) {
    rows = settingRowsFrom(body.settings).filter(r => DEFAULTS.has(r.key));
    const given = new Map(rows.map(r => [r.key, r.value]));
    const blank = [...DEFAULTS.keys()].find(k => !Number.isFinite(given.get(k)));
    if (blank) return bad(`A planning rule is blank or not a number (${blank}). Nothing was saved.`);
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.conferencePlan.update({ where: { id: plan.id }, data });
    if (rows) {
      await tx.conferencePlanSetting.deleteMany({ where: { planId: plan.id } });
      const changed = rows.filter(r => r.value !== DEFAULTS.get(r.key));
      if (changed.length) await tx.conferencePlanSetting.createMany({ data: changed.map(r => ({ planId: plan.id, key: r.key, value: r.value })) });
    }
  });
  return NextResponse.json({ ok: true });
}
