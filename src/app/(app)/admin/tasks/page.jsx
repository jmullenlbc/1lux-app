export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma as db } from '@/lib/db';
import TasksClient from './TasksClient';

export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ILC_ADMIN' && session.role !== 'SUPER_ADMIN') redirect('/dashboard');

  let tasks = [];
  let users = [];

  try {
    [tasks, users] = await Promise.all([
      db.task.findMany({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),
      db.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' },
      }),
    ]);
  } catch (err) {
    console.error('[tasks page]', err?.message ?? err);
  }

  return <TasksClient tasks={tasks} users={users} currentUser={session} />;
}
