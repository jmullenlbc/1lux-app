import { NextResponse } from 'next/server';
import { requireAuth, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Starting cadences, measured rather than guessed.
 *
 * Mike, 2026-09-07: "went quiet after what is the real question." So these came
 * out of four years of his own calendar (scripts/calendar/quietGap.mjs), which
 * measured every gap between two meetings with the same company — 5,353 of them
 * across 434 companies. Every gap measured that way is one the relationship
 * SURVIVED, because another meeting followed it. The shape:
 *
 *   half of survived gaps ≤ 14 days · 80% ≤ 28 days · 90% ≤ 70 days
 *
 * So his real rhythm is two weeks, and the tiers below are set where they flag
 * an unusual gap instead of a normal one. In share-of-normal-rhythm terms:
 *   30 days flags 19% · 45 flags 15% · 60 flags 11% · 75 flags 10% · 90 flags 8%
 *
 * The old values (42/90/90/180/365) were placeholders. The two long ones held up
 * and are unchanged; the three short ones were too loose — a deal you are
 * actively working should not be allowed to go a full quarter in silence.
 *
 * NOTE: re-seeding overwrites cadenceDays, so a tier tuned by hand will be reset
 * if someone posts { seed: true } again.
 */
const DEFAULT_TIERS = [
  { tier: 'VIP_CLIENT',    label: 'VIP Client',     cadenceDays: 30  },
  { tier: 'ACTIVE_DEAL',   label: 'Active Project',    cadenceDays: 45  },
  { tier: 'WARM_PROSPECT', label: 'Warm Prospect',  cadenceDays: 75  },
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
