import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel');
  const activeParam = searchParams.get('active');

  const where = {};
  if (channel) where.channel = channel;
  if (activeParam !== null) where.isActive = activeParam === 'true';

  const templates = await prisma.messageTemplate.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ templates });
}

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { name, channel, scenario, dealStage, clientType, subject, body: templateBody, direction, variables, isDefault, isActive } = body;

  if (!name || !channel || !scenario || !templateBody) {
    return NextResponse.json({ error: 'name, channel, scenario, and body are required' }, { status: 400 });
  }

  const template = await prisma.messageTemplate.create({
    data: {
      name,
      channel,
      scenario,
      dealStage: dealStage ?? null,
      clientType: clientType ?? null,
      subject: subject ?? null,
      body:      templateBody,
      direction: direction || null,
      variables: variables ?? null,
      isDefault: isDefault ?? false,
      isActive: isActive ?? true,
      createdById: user.id,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
