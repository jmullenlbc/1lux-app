import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
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

  const { name, role, permissions, mustChangePassword, isActive, newPassword } = await request.json();

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

  const updated = await prisma.user.update({ where: { id: params.id }, data });

  return NextResponse.json({
    id:                updated.id,
    email:             updated.email,
    name:              updated.name,
    role:              updated.role,
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

  if ((target.role === 'SUPER_ADMIN' || target.role === 'ILC_ADMIN') && !isSuperAdmin(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
