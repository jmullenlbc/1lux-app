export const dynamic = 'force-dynamic';

import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import IntakeClient from './IntakeClient';

export default async function IntakePage() {
  const { user, error } = await requireAdmin(cookies());
  if (error) return error;

  const submissions = await prisma.conceptualSubmission.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      reviewedBy: { select: { name: true } },
      client: { select: { id: true, name: true } },
      duplicateMatch: { select: { id: true, name: true } },
      answers: { orderBy: { createdAt: 'asc' } },
    },
  });

  const clients = await prisma.client.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const projects = await prisma.project.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return <IntakeClient submissions={submissions} clients={clients} projects={projects} currentUser={user} />;
}
