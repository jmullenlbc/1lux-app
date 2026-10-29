export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import ManufacturersClient from './ManufacturersClient';

// Manufacturers list, built like Sales Reps (Mike 10-29).
export default async function ManufacturersPage() {
  const { error } = await requireAuth();
  if (error) redirect('/login');

  let manufacturers = [];
  let offices = [];
  try {
    [manufacturers, offices] = await Promise.all([
      prisma.manufacturer.findMany({
        orderBy: { name: 'asc' },
        include: {
          repLinks: { where: { active: true }, select: { officeId: true, isDefault: true, salesRep: { select: { id: true, name: true } } } },
          _count: { select: { products: { where: { archivedAt: null } } } },
        },
      }),
      prisma.ourOffice.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    ]);
  } catch (err) {
    console.error('[/manufacturers] DB query failed:', err?.message ?? err);
  }

  return <ManufacturersClient initialManufacturers={JSON.parse(JSON.stringify(manufacturers))} offices={offices} />;
}
