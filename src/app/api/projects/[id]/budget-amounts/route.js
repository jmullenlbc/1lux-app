import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { recordBudgetAmount, cleanAmount, BUDGET_TIERS, BUDGET_TIER_LABELS } from '@/lib/budgetAmounts';

export const dynamic = 'force-dynamic';

/**
 * A project's number ladder (0116): Conceptual, then Budget, then Signed PO.
 * GET lists every number ever recorded (archived ones are history).
 * POST { tier, amount, note?, fileId? } types one in by hand (Mike, 2026-10-03:
 * "when we upload the PO or manually enter that amount").
 */
async function load(params) {
  const { user, error } = await requireAuth();
  if (error) return { error };
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, createdById: true } });
  if (!project) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, project };
}

const SELECT = {
  id: true, tier: true, amount: true, source: true, note: true, createdAt: true, archivedAt: true,
  file: { select: { id: true, originalName: true } },
  recordedBy: { select: { name: true } },
};

export async function GET(request, { params }) {
  const { error } = await load(params);
  if (error) return error;
  const amounts = await prisma.projectBudgetAmount.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: 'desc' },
    select: SELECT,
  });
  return NextResponse.json({ amounts });
}

export async function POST(request, { params }) {
  const { user, error } = await load(params);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  if (!BUDGET_TIERS.includes(body.tier)) return NextResponse.json({ error: 'Pick Conceptual, Budget or Signed PO.' }, { status: 400 });
  const amount = cleanAmount(body.amount);
  if (amount == null) return NextResponse.json({ error: 'Type a dollar amount above zero.' }, { status: 400 });

  let fileId = null;
  if (body.fileId) {
    const f = await prisma.projectFile.findFirst({ where: { id: String(body.fileId), projectId: params.id }, select: { id: true } });
    fileId = f?.id || null;
  }
  const row = await recordBudgetAmount(prisma, {
    projectId: params.id, tier: body.tier, amount, source: 'manual', fileId,
    note: typeof body.note === 'string' ? body.note.trim() : null, recordedById: user.id,
  });
  await logActivity(params.id, user, 'project_data',
    `${BUDGET_TIER_LABELS[body.tier]} number set to $${amount.toLocaleString('en-US')}`, { tier: body.tier, amountId: row.id });
  // A typed Signed PO is the supply contract total too (Mike, 2026-10-04).
  let contractValue = null;
  if (body.tier === 'po') {
    await prisma.project.update({ where: { id: params.id }, data: { contractValue: amount } });
    contractValue = amount;
  }
  const fresh = await prisma.projectBudgetAmount.findUnique({ where: { id: row.id }, select: SELECT });
  return NextResponse.json({ amount: fresh, contractValue }, { status: 201 });
}
