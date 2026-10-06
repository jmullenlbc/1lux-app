import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/email/tags: the tags an email can be dropped on (0118).
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const tags = await prisma.emailTag.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  return NextResponse.json({ tags });
}
