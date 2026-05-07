import { requireAuth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import ProductDetailClient from './ProductDetailClient';

export default async function ProductDetailPage({ params }) {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const product = await prisma.manufacturerProduct.findUnique({
    where: { id: params.id },
    include: { manufacturer: { select: { id: true, name: true, numericId: true } } },
  });
  if (!product) notFound();

  const manufacturers = await prisma.manufacturer.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN';
  return <ProductDetailClient product={product} manufacturers={manufacturers} isAdmin={isAdmin} />;
}
