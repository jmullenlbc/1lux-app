export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import ManufacturersClient from './ManufacturersClient';

export default async function ManufacturersPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  let manufacturers = [];
  try {
    manufacturers = await prisma.manufacturer.findMany({
      orderBy: { name: 'asc' },
      include: { products: { orderBy: { partNumber: 'asc' } } },
    });
  } catch (err) {
    console.error('[/manufacturers] DB query failed:', err?.message ?? err);
  }

  return <ManufacturersClient initialManufacturers={manufacturers} />;
}
