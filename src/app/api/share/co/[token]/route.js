import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getProjectRates, calcGroupFooter } from '@/lib/changeOrderRates';

// Public endpoint — no auth required
// GET /api/share/co/[token]
// Returns CO data with DN fields omitted
export async function GET(req, { params }) {
  const share = await prisma.changeOrderShare.findUnique({
    where: { token: params.token },
    include: {
      changeOrder: {
        include: {
          project:     { select: { id: true, name: true, city: true, state: true } },
          optionGroups: {
            orderBy: { sortOrder: 'asc' },
            include: { lineItems: { orderBy: [{ sortOrder: 'asc' }] } },
          },
        },
      },
    },
  });

  if (!share) return NextResponse.json({ error: 'Share link not found or revoked' }, { status: 404 });

  // Track last viewed
  await prisma.changeOrderShare.update({
    where: { id: share.id },
    data:  { lastViewedAt: new Date() },
  }).catch(() => {});

  const co    = share.changeOrder;
  const rates = await getProjectRates(co.projectId);

  // Strip DN/originalDN from line items (never expose buy price externally)
  const sanitizedGroups = co.optionGroups.map(g => ({
    ...g,
    lineItems: g.lineItems.map(li => {
      const { originalDN: _dn, ...rest } = li;
      return { ...rest, totalCN: li.qty * li.cnUnitPrice };
    }),
    footer: calcGroupFooter(g.lineItems, rates),
  }));

  return NextResponse.json({
    co: {
      id:          co.id,
      coNumber:    co.coNumber,
      title:       co.title,
      date:        co.date,
      status:      co.status,
      notes:       co.notes,
      project:     co.project,
      optionGroups: sanitizedGroups,
    },
    rates,
  });
}
