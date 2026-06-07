import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/[id]/tracker/open-items
// Returns all open items grouped by responsible party, with repeat detection.
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const openItems = await prisma.submittalOpenItem.findMany({
    where:   { projectId: params.id, closedRound: null },
    orderBy: [{ isRepeat: 'desc' }, { openedRound: 'asc' }, { typeCode: 'asc' }],
  });

  // Group by responsible party
  const grouped = {};
  for (const item of openItems) {
    const party = item.responsibleParty;
    if (!grouped[party]) grouped[party] = [];
    grouped[party].push(item);
  }

  const summary = {
    total:   openItems.length,
    repeats: openItems.filter(i => i.isRepeat).length,
    byParty: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])),
  };

  return NextResponse.json({ openItems, grouped, summary });
}
