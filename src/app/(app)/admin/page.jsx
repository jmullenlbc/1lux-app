export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEPARTMENTS_SELECT, departmentKeys } from '@/lib/departments';
import AdminClient from './AdminClient';

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Any admin, or anyone in Operations (src/lib/permissions.js).
  if (!actsAsAdmin(session)) redirect('/dashboard');

  let users = [], projects = [];
  try {
    [users, projects] = await Promise.all([
      prisma.user.findMany({
        select: {
          id:                true,
          email:             true,
          name:              true,
          role:              true,
          departments:       DEPARTMENTS_SELECT,
          permissions:       true,
          mustChangePassword: true,
          isActive:          true,
          createdAt:         true,
          passwordHash:      true,
          _count:            { select: { projects: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.project.findMany({
        include: { createdBy: { select: { name: true, email: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
  } catch (err) {
    console.error('[/admin] DB query failed:', err?.message ?? err);
  }

  const formattedUsers = users.map(u => ({
    id:                u.id,
    email:             u.email,
    name:              u.name,
    role:              u.role,
    departments:       departmentKeys(u),
    permissions:       u.permissions,
    mustChangePassword: u.mustChangePassword,
    isActive:          u.isActive,
    createdAt:         u.createdAt,
    hasPassword:       !!u.passwordHash,
    projectCount:      u._count.projects,
  }));

  return (
    <AdminClient
      users={formattedUsers}
      projects={projects}
      currentUser={session}
    />
  );
}
