import { NextResponse } from 'next/server';
import { requireAuth, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

const DEFAULT_TIERS = [
  { tier: 'VIP_CLIENT',    label: 'VIP Client',     cadenceDays: 42  },
  { tier: 'ACTIVE_DEAL',   label: 'Active Deal',    cadenceDays: 90  },
  { tier: 'WARM_PROSPECT', label: 'Warm Prospect',  cadenceDays: 90  },
  { tier: 'PAST_CLIENT',   label: 'Past Client',    cadenceDays: 180 },
  { tier: 'COLD_PROSPECT', label: 'Cold Prospect',  cadenceDays: 365 },
];

// GET /api/crm/cadence-rules
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const rules = await prisma.relationshipCadenceRule.findMany({
    orderBy: { cadenceDays: 'asc' },
  });

  return NextResponse.json({ rules });
}

// POST /api/crm/cadence-rules
// Body: { tier, label, cadenceDays, isActive } — or { seed: true } to upsert defaults
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();

  // Seed handler
  if (body.seed === true) {
    await Promise.all(
      DEFAULT_TIERS.map(({ tier, label, cadenceDays }) =>
        prisma.relationshipCadenceRule.upsert({
          where:  { tier },
          update: { label, cadenceDays },
          create: { tier, label, cadenceDays, isActive: true, createdById: user.id },
        })
      )
    );
    return NextResponse.json({ ok: true, seeded: 5 });
  }

  // Normal create
  const { tier, label, cadenceDays, isActive } = body;

  if (!tier?.trim())  return NextResponse.json({ error: 'tier is required' },        { status: 400 });
  if (!label?.trim()) return NextResponse.json({ error: 'label is required' },       { status: 400 });
  if (cadenceDays == null) return NextResponse.json({ error: 'cadenceDays is required' }, { status: 400 });

  const rule = await prisma.relationshipCadenceRule.create({
    data: {
      tier:        tier.trim(),
      label:       label.trim(),
      cadenceDays: Number(cadenceDays),
      isActive:    isActive !== undefined ? Boolean(isActive) : true,
      createdById: user.id,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}
