import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/users — list users for @mention autocomplete
// Returns name + email for all users (auth required, no admin restriction)
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ users });
}
