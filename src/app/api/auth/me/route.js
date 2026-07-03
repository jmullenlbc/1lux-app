import { NextResponse } from 'next/server';
import { getSession, isSuperAdmin, isSalesAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, role: true, deptRoles: true, permissions: true, createdAt: true },
  });
  return NextResponse.json({
    user,
    superAdmin: isSuperAdmin(user?.role),
    salesAdmin: isSalesAdmin(user),
  });
}
