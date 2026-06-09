export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQcObjectUrl } from '@/lib/qcStorage';
import QcBoardClient from './QcBoardClient';

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

export default async function QcPage({ searchParams }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ILC_ADMIN', 'SUPER_ADMIN'].includes(session.role)) redirect('/dashboard');

  const [rawReports, users] = await Promise.all([
    prisma.bugReport.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const reports  = await Promise.all(rawReports.map(serializeReport));
  const focusId  = searchParams?.focus || null;

  return (
    <QcBoardClient
      reports={reports}
      users={users}
      currentUser={{ id: session.id, name: session.name, email: session.email, role: session.role }}
      focusId={focusId}
    />
  );
}
