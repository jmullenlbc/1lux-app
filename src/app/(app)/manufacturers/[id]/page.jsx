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

  // Reps by office (0144), and every RFQ that asked for this manufacturer:
  // sent to it direct, or to a rep with one of its lines on it.
  const [offices, reps, rfqs] = await Promise.all([
    prisma.ourOffice.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.salesRep.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.rfq.findMany({
      where: { OR: [{ manufacturerId: manufacturer.id }, { lines: { some: { manufacturer: manufacturer.name } } }] },
      orderBy: { number: 'desc' },
      take: 50,
      select: { id: true, number: true, status: true, toName: true, createdAt: true, needBy: true, project: { select: { id: true, name: true } } },
    }),
  ]);

  return <ManufacturerDetailClient manufacturer={JSON.parse(JSON.stringify(manufacturer))} offices={offices} reps={reps} rfqs={JSON.parse(JSON.stringify(rfqs))} />;
}
