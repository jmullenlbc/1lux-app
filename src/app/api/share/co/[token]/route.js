import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getProjectRates, calcGroupFooter } from '@/lib/changeOrderRates';
import { redact, AUDIENCE } from '@/lib/redact';

// Public endpoint, no auth required
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

  // Footers and totals are computed from the FULL rows first, redaction is a
  // transport concern, not a math one.
  const groups = co.optionGroups.map(g => ({
    ...g,
    lineItems: g.lineItems.map(li => ({ ...li, totalCN: li.qty * li.cnUnitPrice })),
    footer: calcGroupFooter(g.lineItems, rates, g),
  }));

  // One redaction pass over the whole response. This covers `rates.marginPct`
  // as well as every line item's `originalDN`, the previous per-item strip
  // dropped the DN but shipped the margin, and `dn = cn × (1 - marginPct)`.
  // The share page only reads salesTax/freight/warehousing off `rates`.
  return NextResponse.json(redact({
    co: {
      id:          co.id,
      coNumber:    co.coNumber,
      title:       co.title,
      date:        co.date,
      status:      co.status,
      notes:       co.notes,
      project:     co.project,
      optionGroups: groups,
    },
    rates,
  }, AUDIENCE.PUBLIC));
}
