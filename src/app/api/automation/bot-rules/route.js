import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const rules = await prisma.botRule.findMany({
    include: {
      createdBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ rules });
}

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { name, triggerType, triggerConfig, actionType, actionConfig, appliesTo, isActive } = body;

  if (!name || !triggerType || !actionType) {
    return NextResponse.json({ error: 'name, triggerType, and actionType are required' }, { status: 400 });
  }

  const rule = await prisma.botRule.create({
    data: {
      name,
      triggerType,
      triggerConfig: typeof triggerConfig === 'string' ? triggerConfig : JSON.stringify(triggerConfig ?? {}),
      actionType,
      actionConfig: typeof actionConfig === 'string' ? actionConfig : JSON.stringify(actionConfig ?? {}),
      appliesTo: appliesTo ?? 'ALL_SALES',
      isActive: isActive ?? true,
      createdBy: { connect: { id: user.id } },
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}
