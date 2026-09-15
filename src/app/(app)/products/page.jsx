export const dynamic = 'force-dynamic';

import { requireAuth, can } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import ProductsClient from './ProductsClient';

export default async function ProductsPage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  let manufacturers = [];
  try {
    manufacturers = await prisma.manufacturer.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  } catch (err) {
    console.error('[/products] DB query failed:', err?.message ?? err);
  }

  // Pre-construction, Design, Construction and admins (src/lib/permissions.js).
  const isAdmin = can(user, 'editProducts');
  return <ProductsClient manufacturers={manufacturers} isAdmin={isAdmin} />;
}
