export const dynamic = 'force-dynamic';

import { requireAuth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import CategoryClient from './CategoryClient';

function canEdit(user) {
  if (['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'].includes(user.role)) return true;
  try { return JSON.parse(user.permissions || '{}').knowledgeBase === true; } catch { return false; }
}

export default async function CategoryPage({ params }) {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const categoryKey = params.category.toUpperCase();

  const [catConfig, standards, allCategories] = await Promise.all([
    prisma.kbCategory ? prisma.kbCategory.findUnique({ where: { key: categoryKey } }) : null,
    prisma.designStandard
      ? prisma.designStandard.findMany({
          where:   { category: categoryKey, isActive: true },
          orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
          include: {
            createdBy: { select: { id: true, name: true } },
            updatedBy: { select: { id: true, name: true } },
          },
        }).catch(err => { console.error('[/knowledge-base/category] DB query failed:', err?.message); return []; })
      : [],
    prisma.kbCategory
      ? prisma.kbCategory.findMany({ orderBy: [{ position: 'asc' }, { label: 'asc' }] }).catch(() => [])
      : [],
  ]);

  if (!catConfig) notFound();

  return (
    <CategoryClient
      standards={standards}
      catConfig={catConfig}
      categories={allCategories}
      isEditor={canEdit(user)}
    />
  );
}
