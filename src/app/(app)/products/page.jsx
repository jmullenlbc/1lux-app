import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import ProductsClient from './ProductsClient';

export default async function ProductsPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const manufacturers = await prisma.manufacturer.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN';
  return <ProductsClient manufacturers={manufacturers} isAdmin={isAdmin} />;
}
