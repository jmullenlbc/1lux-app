export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import ManufacturerDetailClient from './ManufacturerDetailClient';

export default async function ManufacturerDetailPage({ params }) {
  const { error } = await requireAuth();
  if (error) redirect('/login');

  let manufacturer = null;
  try {
    manufacturer = await prisma.manufacturer.findUnique({
      where: { id: params.id },
      include: {
        products: { where: { archivedAt: null }, orderBy: { partNumber: 'asc' } },
        emails: { orderBy: { sortOrder: 'asc' } },
        repLinks: { where: { active: true }, include: { salesRep: { select: { id: true, name: true } } } },
      },
    });
  } catch (err) {
    console.error('[/manufacturers/id] DB query failed:', err?.message ?? err);
  }
  if (!manufacturer) notFound();

  // Reps by office (0144).
  const [offices, reps] = await Promise.all([
    prisma.ourOffice.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.salesRep.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return <ManufacturerDetailClient manufacturer={JSON.parse(JSON.stringify(manufacturer))} offices={offices} reps={reps} />;
}
