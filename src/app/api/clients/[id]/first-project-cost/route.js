import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { firstProjectCostRows } from '@/lib/sales/firstProject';

// GET /api/clients/[id]/first-project-cost (0129): this client's road to its
// first won project, for the Overview tab.
export async function GET(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const [row] = await firstProjectCostRows(prisma, { clientIds: [params.id] });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}
