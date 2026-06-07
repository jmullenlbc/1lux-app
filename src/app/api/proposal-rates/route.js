import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

const DEFAULT_RATES = [
  { role: 'SR_DESIGNER', hourlyRate: 180 },
  { role: 'DESIGNER',    hourlyRate: 115 },
  { role: 'SALES',       hourlyRate: 160 },
  { role: 'OUTSOURCE',   hourlyRate: 115 },
];

export async function GET(req) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  let rates = await prisma.proposalRate.findMany({
    orderBy: { role: 'asc' },
    include: { updatedBy: { select: { id: true, name: true } } },
  });

  // Seed defaults if table is empty
  if (rates.length === 0) {
    await prisma.proposalRate.createMany({
      data: DEFAULT_RATES.map(r => ({ id: require('crypto').randomUUID(), ...r })),
      skipDuplicates: true,
    });
    rates = await prisma.proposalRate.findMany({ orderBy: { role: 'asc' } });
  }

  return NextResponse.json({ rates });
}

// PUT /api/proposal-rates  body: { rates: [{role, hourlyRate}] }
export async function PUT(req) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const { rates } = await req.json();
  if (!Array.isArray(rates)) return NextResponse.json({ error: 'rates array required' }, { status: 400 });

  await Promise.all(
    rates.map(r =>
      prisma.proposalRate.upsert({
        where:  { role: r.role },
        update: { hourlyRate: r.hourlyRate, updatedById: user.id },
        create: { role: r.role, hourlyRate: r.hourlyRate, updatedById: user.id },
      })
    )
  );

  const updated = await prisma.proposalRate.findMany({
    orderBy: { role: 'asc' },
    include: { updatedBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ rates: updated });
}
