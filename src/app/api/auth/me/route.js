import { NextResponse } from 'next/server';
import { getSession, isSuperAdmin, isSalesAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEPARTMENTS_SELECT, departmentKeys } from '@/lib/departments';

export async function GET(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, role: true, departments: DEPARTMENTS_SELECT, permissions: true, createdAt: true },
  });
  return NextResponse.json({
    user: user && { ...user, departments: departmentKeys(user) },
    superAdmin: isSuperAdmin(user?.role),
    salesAdmin: isSalesAdmin(user),
  });
}
