export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import CategoryClient from './CategoryClient';
import { CATEGORIES } from '../categories';

function canEdit(user) {
  if (['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'].includes(user.role)) return true;
  try { return JSON.parse(user.permissions || '{}').knowledgeBase === true; } catch { return false; }
}

export default async function CategoryPage({ params }) {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const categoryKey = params.category.toUpperCase();
  const catConfig   = CATEGORIES.find(c => c.key === categoryKey);
  if (!catConfig) notFound();

  let standards = [];
  try {
    standards = await prisma.designStandard.findMany({
      where:   { category: categoryKey, isActive: true },
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
      },
    });
  } catch (err) {
    console.error('[/knowledge-base/category] DB query failed:', err?.message ?? err);
  }

  return (
    <CategoryClient
      standards={standards}
      catConfig={catConfig}
      isEditor={canEdit(user)}
    />
  );
}
