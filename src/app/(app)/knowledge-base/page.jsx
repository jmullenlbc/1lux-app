import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import KnowledgeBaseClient from './KnowledgeBaseClient';

function canEdit(user) {
  if (['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'].includes(user.role)) return true;
  try { return JSON.parse(user.permissions || '{}').knowledgeBase === true; } catch { return false; }
}

export default async function KnowledgeBasePage() {
  const { user, error } = await requireAuth();
  if (error) redirect('/login');

  const standards = await prisma.designStandard.findMany({
    where: { isActive: true },
    orderBy: [{ category: 'asc' }, { severity: 'asc' }, { createdAt: 'asc' }],
    include: {
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
  });

  return <KnowledgeBaseClient standards={standards} isEditor={canEdit(user)} />;
}
