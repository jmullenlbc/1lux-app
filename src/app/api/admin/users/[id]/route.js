import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { INCLUDE_ARCHIVED } from '@/lib/archive';
import { requireAdmin } from '@/lib/auth';
import { ROLE_KEYS, isValidRole, canAssignRole, canManageAccount } from '@/lib/roles';
import { effectiveRole } from '@/lib/permissions';
import { DEPARTMENT_KEYS, cleanDepartments, departmentKeys } from '@/lib/departments';

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

  // createMany without skipDuplicates: that option throws on SQLite, and
  // cleanDepartments has already removed repeats.
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: params.id }, data }),
    ...(deptKeys ? [
      prisma.userDepartment.deleteMany({ where: { userId: params.id } }),
      prisma.userDepartment.createMany({ data: deptKeys.map(department => ({ userId: params.id, department })) }),
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

export async function DELETE(request, { params }) {
  const { user: actor, error } = await requireAdmin(request);
  if (error) return error;

  if (params.id === actor.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Same rule as PATCH: nobody but a Super Admin touches a Super Admin's account.
  if (!canManageAccount(effectiveRole(actor), target.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Count records with required (non-nullable) FK references that can't be nullified
  const [projects, clients, tasks, changeOrders, designBidMatrices] =
    await Promise.all([
      // Archived rows still point at the user, so they block a delete too.
      prisma.project.count({ where: { createdById: params.id, ...INCLUDE_ARCHIVED } }),
      prisma.client.count({ where: { createdById: params.id, ...INCLUDE_ARCHIVED } }),
      prisma.task.count({ where: { createdById: params.id } }),
      prisma.changeOrder.count({ where: { createdById: params.id } }),
      prisma.designBidMatrix.count({ where: { pushedById: params.id } }),
    ]);

  const total = projects + clients + tasks + changeOrders + designBidMatrices;
  if (total > 0) {
    const parts = [
      projects      && `${projects} project(s)`,
      clients       && `${clients} client(s)`,
      tasks         && `${tasks} task(s)`,
      changeOrders  && `${changeOrders} change order(s)`,
      designBidMatrices && `${designBidMatrices} bid matrix/matrices`,
    ].filter(Boolean);
    return NextResponse.json(
      { error: `Cannot delete — user owns ${parts.join(', ')}. Deactivate the account instead.` },
      { status: 400 }
    );
  }

  // Nullify optional FK references so the delete succeeds
  await prisma.$transaction([
    prisma.client.updateMany({ where: { ownerId: params.id }, data: { ownerId: null } }),
    prisma.project.updateMany({ where: { salesOwnerId: params.id }, data: { salesOwnerId: null } }),
    prisma.designStandard.updateMany({ where: { updatedById: params.id }, data: { updatedById: null } }),
    prisma.rFI.updateMany({ where: { assignedToId: params.id }, data: { assignedToId: null } }),
    prisma.budgetQCChecklist.updateMany({ where: { assignedToId: params.id }, data: { assignedToId: null } }),
    prisma.warehouseRelease.updateMany({ where: { releasedById: params.id }, data: { releasedById: null } }),
    prisma.warehouseRelease.updateMany({ where: { approvedById: params.id }, data: { approvedById: null } }),
    prisma.bugReport.updateMany({ where: { assigneeId: params.id }, data: { assigneeId: null } }),
  ]);

  try {
    await prisma.user.delete({ where: { id: params.id } });
  } catch (err) {
    if (err?.code === 'P2003') {
      return NextResponse.json(
        { error: 'Cannot delete — user has associated records. Deactivate the account instead.' },
        { status: 400 }
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
