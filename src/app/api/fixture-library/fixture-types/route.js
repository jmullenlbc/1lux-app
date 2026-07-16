import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const types = await prisma.fixtureType.findMany({
    orderBy: [{ master_type_id: 'asc' }, { code: 'asc' }],
  });
  return NextResponse.json(types);
}
