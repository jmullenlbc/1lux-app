import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ROLE_KEYS, isValidRole, canAssignRole, canManageAccount } from '@/lib/roles';
import { effectiveRole } from '@/lib/permissions';
import { DEPARTMENT_KEYS, cleanDepartments, departmentKeys } from '@/lib/departments';
import { accessChanges } from '@/lib/accessEvents';

export async function PATCH(request, { params }) {
  const { user: actor, error } = await requireAdmin(request);
  if (error) return error;

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Nobody but a Super Admin touches a Super Admin's account (src/lib/roles.js).
  // Operations acts as a Company Admin (src/lib/permissions.js).
  if (!canManageAccount(effectiveRole(actor), target.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Can't modify yourself via this endpoint (use change-password)
  if (target.id === actor.id) {
    return NextResponse.json({ error: 'Use account settings to modify your own account' }, { status: 400 });
  }

  const { name, role, departments, permissions, mustChangePassword, isActive, newPassword } = await request.json();

  // Only the four real role names can be saved — this used to store any text it
  // was sent. A Company Admin can make someone an admin (Mike, 2026-09-14);
  // only a Super Admin can make a Super Admin.
  if (role !== undefined) {
    if (!isValidRole(role)) {
      return NextResponse.json({ error: `Unknown role. Use one of: ${ROLE_KEYS.join(', ')}` }, { status: 400 });
    }
    if (!canAssignRole(effectiveRole(actor), role)) {
      return NextResponse.json({ error: 'Only a Super Admin can make someone a Super Admin' }, { status: 403 });
    }
  }

  // departments: the full list of department keys this person belongs to
  // (a multi-select, Mike 2026-09-12). Sending it replaces the whole list.
  let deptKeys;
  if (departments !== undefined) {
    deptKeys = cleanDepartments(departments);
    if (!deptKeys) {
      return NextResponse.json({ error: `departments must be a list. Use any of: ${DEPARTMENT_KEYS.join(', ')}` }, { status: 400 });
    }
  }

  const data = {};
  if (name !== undefined)              data.name              = name;
  if (role !== undefined)              data.role              = role;
  if (permissions !== undefined)       data.permissions       = JSON.stringify(permissions);
  if (mustChangePassword !== undefined) data.mustChangePassword = mustChangePassword;
  if (isActive !== undefined)          data.isActive          = isActive;
  if (newPassword) {
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  // Access history (migration 0086): one row per thing that actually changed,
  // saved in the same transaction as the change. The password is never logged,
  // only the fact that an admin reset it.
  const deptsBefore = await prisma.userDepartment.findMany({ where: { userId: params.id }, select: { department: true } });
  const changes = accessChanges(
    { ...target, departments: departmentKeys({ departments: deptsBefore }) },
    { name, role, isActive, mustChangePassword, permissions, departments: deptKeys, passwordReset: !!newPassword },
  );

  // createMany without skipDuplicates: that option throws on SQLite, and
  // cleanDepartments has already removed repeats.
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: params.id }, data }),
    ...(deptKeys ? [
      prisma.userDepartment.deleteMany({ where: { userId: params.id } }),
      prisma.userDepartment.createMany({ data: deptKeys.map(department => ({ userId: params.id, department })) }),
    ] : []),
    ...(changes.length ? [
      prisma.userAccessEvent.createMany({ data: changes.map(c => ({ ...c, userId: params.id, changedById: actor.id })) }),
    ] : []),
  ]);
  const depts = await prisma.userDepartment.findMany({ where: { userId: params.id }, select: { department: true } });

  return NextResponse.json({
    id:                updated.id,
    email:             updated.email,
    name:              updated.name,
    role:              updated.role,
    departments:       departmentKeys({ departments: depts }),
    permissions:       updated.permissions,
    mustChangePassword: updated.mustChangePassword,
    isActive:          updated.isActive,
  });
}

// People are turned off, never deleted (archive-only, Mike 2026-09-11: "yes
// archive only for everything"). Turning someone off signs them out at once
// and keeps every job, note and change they made, and their access history.
// This used to hard-delete anyone who happened to own no projects or clients.
export async function DELETE(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  return NextResponse.json(
    { error: 'People are turned off, never deleted. Use "Turn off" on the Users list: they are signed out at once and nothing they made is lost.' },
    { status: 405 },
  );
}
