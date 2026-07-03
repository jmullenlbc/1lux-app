import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/users — list users for @mention autocomplete / owner pickers.
// Optional ?division=SALES filters to one division (used by the Sales Owner dropdown).
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const division = new URL(request.url).searchParams.get('division');

  const users = await prisma.user.findMany({
    where: { isActive: true, ...(division ? { division } : {}) },
    select: { id: true, name: true, email: true, division: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ users });
}
