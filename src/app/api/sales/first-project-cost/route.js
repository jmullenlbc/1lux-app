import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { firstProjectCostReport } from '@/lib/sales/firstProject';

// GET /api/sales/first-project-cost (0129)
// How many meetings and how much money it took to win the first project with
// each client: one row per client, a team summary, one summary per salesperson.
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  return NextResponse.json(await firstProjectCostReport(prisma));
}
