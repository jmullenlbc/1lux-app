import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/proposals/[id]/line-items
// Body: { items: [{id?, area, task, sortOrder, srHours, designerHours, salesHours, outsourceHours}] }
// Replaces all line items and recomputes calculatedFee on the proposal.
export async function POST(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const proposal = await prisma.proposal.findUnique({ where: { id: params.id } });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { items } = await req.json();
  if (!Array.isArray(items)) return NextResponse.json({ error: 'items array required' }, { status: 400 });

  const rates = JSON.parse(proposal.rateSnapshot || '{}');
  const SR = rates.SR_DESIGNER ?? 180;
  const DE = rates.DESIGNER    ?? 115;
  const SA = rates.SALES       ?? 160;
  const OU = rates.OUTSOURCE   ?? 115;

  // Compute new calculatedFee from incoming items
  const rawLabor = items.reduce((sum, li) => {
    return sum
      + (li.srHours        || 0) * SR
      + (li.designerHours  || 0) * DE
      + (li.salesHours     || 0) * SA
      + (li.outsourceHours || 0) * OU;
  }, 0);
  const calculatedFee = rawLabor * (1 + (proposal.adderPct || 10) / 100);

  const [, updated] = await prisma.$transaction([
    // Replace all line items
    prisma.proposalLineItem.deleteMany({ where: { proposalId: params.id } }),
    // Update fee snapshot on proposal
    prisma.proposal.update({
      where: { id: params.id },
      data: {
        calculatedFee,
        lineItems: {
          create: items.map((li, idx) => ({
            area:          li.area,
            task:          li.task,
            sortOrder:     li.sortOrder ?? idx,
            srHours:       li.srHours        || 0,
            designerHours: li.designerHours  || 0,
            salesHours:    li.salesHours     || 0,
            outsourceHours: li.outsourceHours || 0,
          })),
        },
      },
      include: { lineItems: { orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] } },
    }),
  ]);

  return NextResponse.json({ calculatedFee, lineItems: updated.lineItems });
}
