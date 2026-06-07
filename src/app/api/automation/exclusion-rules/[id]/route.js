import { NextResponse } from 'next/server';
import { requireAuth, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/automation/exclusion-rules/[id]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existing = await prisma.activityExclusionRule.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  const body = await request.json();
  const { name, ruleType, config, isActive } = body;

  const data = {};
  if (name     !== undefined) data.name     = name.trim();
  if (ruleType !== undefined) data.ruleType = ruleType.trim();
  if (config   !== undefined) data.config   = typeof config === 'string' ? config : JSON.stringify(config);
  if (isActive !== undefined) data.isActive = Boolean(isActive);

  const rule = await prisma.activityExclusionRule.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ rule });
}

// DELETE /api/automation/exclusion-rules/[id]  — admin only
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  if (!isAnyAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const existing = await prisma.activityExclusionRule.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  await prisma.activityExclusionRule.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
