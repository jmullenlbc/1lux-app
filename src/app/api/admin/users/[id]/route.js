import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { INCLUDE_ARCHIVED } from '@/lib/archive';
import { requireAdmin, isSuperAdmin } from '@/lib/auth';

export async function PATCH(request, { params }) {
  const { user: actor, error } = await requireAdmin(request);
  if (error) return error;

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Only SUPER_ADMIN can modify SUPER_ADMIN or COMPANY_ADMIN accounts
  if ((target.role === 'SUPER_ADMIN' || target.role === 'ILC_ADMIN' ||
       target.role === 'COMPANY_ADMIN' || target.role === 'ADMIN') && !isSuperAdmin(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Can't modify yourself via this endpoint (use change-password)
  if (target.id === actor.id) {
    return NextResponse.json({ error: 'Use account settings to modify your own account' }, { status: 400 });
  }

  const { name, role, division, deptRoles, permissions, mustChangePassword, isActive, newPassword } = await request.json();

  const data = {};
  if (name !== undefined)              data.name              = name;
  if (role !== undefined)              data.role              = role;
  if (division !== undefined)          data.division          = division || null;
  if (deptRoles !== undefined)         data.deptRoles         = JSON.stringify(Array.isArray(deptRoles) ? deptRoles : []);
  if (permissions !== undefined)       data.permissions       = JSON.stringify(permissions);
  if (mustChangePassword !== undefined) data.mustChangePassword = mustChangePassword;
  if (isActive !== undefined)          data.isActive          = isActive;
  if (newPassword) {
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  const updated = await prisma.user.update({ where: { id: params.id }, data });

  return NextResponse.json({
    id:                updated.id,
    email:             updated.email,
    name:              updated.name,
    role:              updated.role,
    division:          updated.division,
    deptRoles:         updated.deptRoles,
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

  // Only SUPER_ADMIN can delete any admin-level account (matches PATCH protection)
  if ((target.role === 'SUPER_ADMIN' || target.role === 'ILC_ADMIN' ||
       target.role === 'COMPANY_ADMIN' || target.role === 'ADMIN') && !isSuperAdmin(actor.role)) {
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
