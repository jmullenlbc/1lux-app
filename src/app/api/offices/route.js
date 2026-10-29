import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/offices  ILC offices, for the project office picker and Admin > Our Offices (0144).
export async function GET(request) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const offices = await prisma.ourOffice.findMany({ orderBy: { sortOrder: 'asc' } });
  return NextResponse.json({ offices });
}
