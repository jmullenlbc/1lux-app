export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import ProductDetailClient from './ProductDetailClient';

export default async function ProductDetailPage({ params }) {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  let product = null, manufacturers = [];
  try {
    [product, manufacturers] = await Promise.all([
      prisma.manufacturerProduct.findUnique({
        where: { id: params.id },
        include: { manufacturer: { select: { id: true, name: true, numericId: true } } },
      }),
      prisma.manufacturer.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
  } catch (err) {
    console.error('[/products/id] DB query failed:', err?.message ?? err);
  }
  if (!product) notFound();

  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN';
  return <ProductDetailClient product={product} manufacturers={manufacturers} isAdmin={isAdmin} />;
}
