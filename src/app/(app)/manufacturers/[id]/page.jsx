import { requireAuth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import ManufacturerDetailClient from './ManufacturerDetailClient';

export default async function ManufacturerDetailPage({ params }) {
  const { error } = await requireAuth();
  if (error) redirect('/login');

  const manufacturer = await prisma.manufacturer.findUnique({
    where: { id: params.id },
    include: { products: { orderBy: { partNumber: 'asc' } } },
  });
  if (!manufacturer) notFound();

  return <ManufacturerDetailClient manufacturer={manufacturer} />;
}
