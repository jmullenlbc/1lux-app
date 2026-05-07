import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import ManufacturersClient from './ManufacturersClient';

export default async function ManufacturersPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const manufacturers = await prisma.manufacturer.findMany({
    orderBy: { name: 'asc' },
    include: { products: { orderBy: { partNumber: 'asc' } } },
  });

  return <ManufacturersClient initialManufacturers={manufacturers} />;
}
