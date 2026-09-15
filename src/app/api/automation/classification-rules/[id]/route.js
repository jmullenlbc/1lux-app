import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { invalidateRulesCache } from '@/lib/bot/activityClassifier';

export async function PATCH(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const existing = await prisma.activityClassificationRule.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const rule = await prisma.activityClassificationRule.update({
    where: { id: params.id },
    data: {
      ...(body.name           !== undefined && { name:           body.name }),
      ...(body.conditionType  !== undefined && { conditionType:  body.conditionType }),
      ...(body.conditionValue !== undefined && { conditionValue: body.conditionValue }),
      ...(body.resultType     !== undefined && { resultType:     body.resultType }),
      ...(body.priority       !== undefined && { priority:       body.priority }),
      ...(body.isActive       !== undefined && { isActive:       body.isActive }),
    },
  });
  invalidateRulesCache();
  return NextResponse.json({ rule });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!actsAsAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.activityClassificationRule.delete({ where: { id: params.id } });
  invalidateRulesCache();
  return NextResponse.json({ ok: true });
}
