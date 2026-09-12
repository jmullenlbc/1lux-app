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
      include: { products: { where: { archivedAt: null }, orderBy: { partNumber: 'asc' } } },
    });
  } catch (err) {
    console.error('[/manufacturers/id] DB query failed:', err?.message ?? err);
  }
  if (!manufacturer) notFound();

  return <ManufacturerDetailClient manufacturer={manufacturer} />;
}
