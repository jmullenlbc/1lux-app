import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { invalidateMassEmailThreshold } from '@/lib/email/settings';

// GET /api/automation/exclusion-rules
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const rules = await prisma.activityExclusionRule.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ rules });
}

// POST /api/automation/exclusion-rules
// Body: { name, ruleType, config?, isActive? }
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { name, ruleType, config, isActive } = body;

  if (!name?.trim())     return NextResponse.json({ error: 'name is required' },     { status: 400 });
  if (!ruleType?.trim()) return NextResponse.json({ error: 'ruleType is required' }, { status: 400 });

  const rule = await prisma.activityExclusionRule.create({
    data: {
      name:        name.trim(),
      ruleType:    ruleType.trim(),
      config:      config !== undefined
                     ? (typeof config === 'string' ? config : JSON.stringify(config))
                     : '{}',
      isActive:    isActive !== undefined ? Boolean(isActive) : true,
      createdById: user.id,
    },
  });

  // The mass-email threshold is cached — drop it so a new rule takes effect now.
  invalidateMassEmailThreshold();

  return NextResponse.json({ rule }, { status: 201 });
}
