import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const config = await prisma.botConfig.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      schedulingEnabled: false,
      followUpEnabled: false,
      reviewWindowMinutes: 30,
      proposalCount: 3,
      confirmationMessage: null,
    },
  });

  return NextResponse.json({ config });
}

export async function PUT(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { schedulingEnabled, followUpEnabled, reviewWindowMinutes, proposalCount, confirmationMessage } = body;

  const config = await prisma.botConfig.upsert({
    where: { userId: user.id },
    update: {
      ...(schedulingEnabled !== undefined && { schedulingEnabled }),
      ...(followUpEnabled !== undefined && { followUpEnabled }),
      ...(reviewWindowMinutes !== undefined && { reviewWindowMinutes }),
      ...(proposalCount !== undefined && { proposalCount }),
      ...(confirmationMessage !== undefined && { confirmationMessage }),
    },
    create: {
      userId: user.id,
      schedulingEnabled: schedulingEnabled ?? false,
      followUpEnabled: followUpEnabled ?? false,
      reviewWindowMinutes: reviewWindowMinutes ?? 30,
      proposalCount: proposalCount ?? 3,
      confirmationMessage: confirmationMessage ?? null,
    },
  });

  return NextResponse.json({ config });
}
