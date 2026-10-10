import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ROLE_KEYS, isValidRole, canAssignRole } from '@/lib/roles';
import { effectiveRole } from '@/lib/permissions';
import { DEPARTMENT_KEYS, DEPARTMENTS_SELECT, cleanDepartments, departmentKeys } from '@/lib/departments';
import { creationEvents } from '@/lib/accessEvents';

export async function GET(request) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const users = await prisma.user.findMany({
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
  });

  return NextResponse.json(users.map(u => ({
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
  })));
}

export async function POST(request) {
  const { user: actor, error } = await requireAdmin(request);
  if (error) return error;

  const { name, email, password, role, permissions, mustChangePassword, departments } = await request.json();

  if (!email || !password || !role) {
    return NextResponse.json({ error: 'email, password, and role are required' }, { status: 400 });
  }
  const deptKeys = departments === undefined ? [] : cleanDepartments(departments);
  if (!deptKeys) {
    return NextResponse.json({ error: `departments must be a list. Use any of: ${DEPARTMENT_KEYS.join(', ')}` }, { status: 400 });
  }
  if (!isValidRole(role)) {
    return NextResponse.json({ error: `Unknown role. Use one of: ${ROLE_KEYS.join(', ')}` }, { status: 400 });
  }
  // A Company Admin can make someone an admin (Mike, 2026-09-14); only a Super
  // Admin can make a Super Admin. Operations acts as a Company Admin.
  if (!canAssignRole(effectiveRole(actor), role)) {
    return NextResponse.json({ error: 'Only a Super Admin can make someone a Super Admin' }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const defaultPermissions = buildDefaultPermissions(role);

  const newUser = await prisma.user.create({
    data: {
      email:             email.toLowerCase(),
      name:              name || null,
      passwordHash,
      role,
      permissions:       permissions ? JSON.stringify(permissions) : JSON.stringify(defaultPermissions),
      mustChangePassword: mustChangePassword ?? true,
      departments:       deptKeys.length ? { create: deptKeys.map(department => ({ department })) } : undefined,
      // Access history (0086): created as this role, in these departments.
      accessEvents:      { create: creationEvents({ role, departments: deptKeys }).map(e => ({ ...e, changedById: actor.id })) },
    },
  });

  return NextResponse.json({
    id:                newUser.id,
    email:             newUser.email,
    name:              newUser.name,
    role:              newUser.role,
    departments:       deptKeys,
    mustChangePassword: newUser.mustChangePassword,
  }, { status: 201 });
}

function buildDefaultPermissions(role) {
  if (role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN') {
    return { projects: 'edit', clients: 'edit', preCon: 'edit', manufacturers: 'edit', admin: 'edit' };
  }
  // A Sales Admin or Sales login (10-9) starts with a User's module access;
  // what the role adds is decided in auth.js, not here.
  if (role === 'USER' || role === 'SALES_ADMIN' || role === 'SALES') {
    return { projects: 'edit', clients: 'edit', preCon: 'edit', manufacturers: 'view', admin: 'none' };
  }
  // CLIENT_VIEWER
  return { projects: 'view', clients: 'none', preCon: 'none', manufacturers: 'none', admin: 'none' };
}
