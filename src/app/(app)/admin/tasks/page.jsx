export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQcObjectUrl } from '@/lib/qcStorage';
import TasksQcClient from './TasksQcClient';

async function serializeReport(r) {
  return {
    ...r,
    consoleLog:    JSON.parse(r.consoleJson  || '[]'),
    networkLog:    JSON.parse(r.networkJson  || '[]'),
    pageState:     r.pageStateJson ? JSON.parse(r.pageStateJson) : null,
    screenshotUrl: r.screenshotKey ? await getQcObjectUrl(r.screenshotKey) : null,
    createdAt:     r.createdAt.toISOString(),
    updatedAt:     r.updatedAt.toISOString(),
  };
}

export default async function TasksPage({ searchParams }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ILC_ADMIN' && session.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const initialTab = searchParams?.tab === 'bugs' ? 'bugs' : 'tasks';
  const focusId    = searchParams?.focus || null;

  let tasks = [], rawReports = [], users = [];

  try {
    [tasks, rawReports, users] = await Promise.all([
      prisma.task.findMany({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          assignee:  { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.bugReport.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.user.findMany({
        where:   { isActive: true },
        select:  { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' },
      }),
    ]);
  } catch (err) {
    console.error('[tasks page]', err?.message ?? err);
  }

  const reports = await Promise.all(rawReports.map(serializeReport));

  return (
    <TasksQcClient
      tasks={tasks}
      users={users}
      currentUser={{ id: session.id, name: session.name, email: session.email, role: session.role }}
      reports={reports}
      initialTab={initialTab}
      focusId={focusId}
    />
  );
}
