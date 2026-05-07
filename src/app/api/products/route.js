import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search       = searchParams.get('search')?.trim() || '';
  const mfrId        = searchParams.get('manufacturerId') || '';
  const fixtureType  = searchParams.get('fixtureType') || '';
  const page         = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit        = Math.min(200, Math.max(10, parseInt(searchParams.get('limit') || '100')));

  const where = {};
  if (mfrId) where.manufacturerId = mfrId;
  if (fixtureType) where.fixtureType = fixtureType;
  if (search) {
    where.OR = [
      { partNumber:   { contains: search } },
      { description:  { contains: search } },
      { manufacturer: { name: { contains: search } } },
    ];
  }

  const [total, products] = await Promise.all([
    prisma.manufacturerProduct.count({ where }),
    prisma.manufacturerProduct.findMany({
      where,
      orderBy: [{ manufacturer: { name: 'asc' } }, { partNumber: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: { manufacturer: { select: { id: true, numericId: true, name: true } } },
    }),
  ]);

  return NextResponse.json({ products, total, page, limit });
}
