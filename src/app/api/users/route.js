import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEPARTMENT_KEYS, DEPARTMENTS_SELECT, departmentKeys, inDepartment } from '@/lib/departments';

// GET /api/users — list users for @mention autocomplete / owner pickers.
// Optional ?department=SALES_MARKETING keeps only that department (used by the
// Sales Owner dropdowns). Each user comes back with a plain list of department
// keys.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const department = new URL(request.url).searchParams.get('department');
  if (department && !DEPARTMENT_KEYS.includes(department)) {
    return NextResponse.json({ error: `Unknown department. Use one of: ${DEPARTMENT_KEYS.join(', ')}` }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    where: { isActive: true, ...(department ? inDepartment(department) : {}) },
    select: { id: true, name: true, email: true, departments: DEPARTMENTS_SELECT },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ users: users.map(u => ({ ...u, departments: departmentKeys(u) })) });
}
