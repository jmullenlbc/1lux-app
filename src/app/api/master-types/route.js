import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/master-types
// Returns all active master types for the markup toolbar
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  if (!prisma.masterType) return NextResponse.json([]);

  const masterTypes = await prisma.masterType.findMany({
    where: { is_active: true },
    orderBy: { code: 'asc' },
  });

  return NextResponse.json(masterTypes);
}
