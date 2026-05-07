import { redirect } from 'next/navigation';
import { getSession, isAnyAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AdminClient from './AdminClient';

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAnyAdmin(session.role)) redirect('/dashboard');

  const users = await prisma.user.findMany({
    select: {
      id:                true,
      email:             true,
      name:              true,
      role:              true,
      permissions:       true,
      mustChangePassword: true,
      isActive:          true,
      createdAt:         true,
      passwordHash:      true,
      _count:            { select: { projects: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const projects = await prisma.project.findMany({
    include: {
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const formattedUsers = users.map(u => ({
    id:                u.id,
    email:             u.email,
    name:              u.name,
    role:              u.role,
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
