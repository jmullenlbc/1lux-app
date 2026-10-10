import * as React from 'react';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEPARTMENTS_SELECT, departmentKeys, hasDepartment, SALES_MARKETING } from './departments';
import { ROLE_LABEL } from './roles';
import { actsAsAdmin, can, deniedMessage } from './permissions';

// The permission table lives in ./permissions (no server-only code, so screens
// can use it too). Re-exported so routes import every guard from one place.
export { actsAsAdmin, can };

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'ilc-studios-secret'
);

const COOKIE_NAME = 'ilc_session';

// ── Role helpers ─────────────────────────────────────────────────────────────

export function isSuperAdmin(role) {
  return role === 'SUPER_ADMIN' || role === 'ILC_ADMIN';
}

export function isCompanyAdmin(role) {
  return role === 'COMPANY_ADMIN' || role === 'ADMIN';
}

export function isAnyAdmin(role) {
  return isSuperAdmin(role) || isCompanyAdmin(role);
}

export function isClientViewer(role) {
  return role === 'CLIENT_VIEWER';
}

// ── Who can see which records ────────────────────────────────────────────────
// Mike, 2026-08-25: every ILC staff account sees every project, every client
// and every contact inside a client. Ownership is still recorded on each
// record (createdById) — it just no longer decides who is allowed to look.
//
// External Client Viewers are the one exception and must stay scoped to their
// own records: they are contractors, and buy/DN pricing must never reach them.
//
// This is deliberately one function rather than sixty copies of the same
// role test, so that narrowing visibility again later is a one-line change
// here instead of a sweep through every route.
export function canSeeAllData(user) {
  const role = typeof user === 'string' ? user : user?.role;
  return !isClientViewer(role);
}

// Parse a User.permissions value (JSON string or object) safely.
export function parsePermissions(permissions) {
  if (!permissions) return {};
  if (typeof permissions === 'object') return permissions;
  try { return JSON.parse(permissions) || {}; } catch { return {}; }
}

// Sales Admin = a user explicitly granted the `salesAdmin` permission, OR any
// Super Admin (higher tier). Used to gate Sales-Automation admin actions.
// `user` may be { role, permissions } where permissions is a JSON string or object.
export function isSalesAdmin(user) {
  if (!user) return false;
  if (isSuperAdmin(user.role)) return true;
  if (user.role === 'SALES_ADMIN') return true;   // the role (10-9), not just the flag
  return parsePermissions(user.permissions).salesAdmin === true;
}

export function getRoleLabel(role) {
  return ROLE_LABEL[role] || role;
}

// ── JWT ──────────────────────────────────────────────────────────────────────

export async function signToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

// ── The live account behind a login pass ─────────────────────────────────────
// The login pass lasts seven days and only says who someone was when they
// signed in. Until 2026-09-14 nothing else was checked, so a turned-off account
// kept working for up to a week and a role change waited for the next sign-in.
// Every request now reads the account itself: turning someone off or changing
// their role takes effect on their very next click (Mike: "that's fine").
//
// The pass never carried permissions or departments either, so every screen
// that read them from it quietly never matched. They come from the account now.
//
// cache(): a page and its layout both ask on the same request — one read, not two.
const cache = React.cache || (fn => fn);

const loadAccount = cache(async (id) => {
  // Lazy import to avoid a hard dependency in edge/middleware contexts.
  const { prisma } = await import('@/lib/db');
  return prisma.user.findUnique({
    where:  { id },
    select: {
      id: true, email: true, name: true, role: true, isActive: true,
      mustChangePassword: true, permissions: true, departments: DEPARTMENTS_SELECT,
    },
  });
});

async function liveUser(payload) {
  if (!payload?.id) return null;
  const account = await loadAccount(payload.id);
  if (!account || account.isActive === false) return null;
  return {
    ...payload,
    id:                 account.id,
    email:              account.email,
    name:               account.name,
    role:               account.role,
    mustChangePassword: account.mustChangePassword || false,
    permissions:        account.permissions,
    departments:        departmentKeys(account),
  };
}

export async function getSession() {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await liveUser(await verifyToken(token));
}

export function setSessionCookie(response, token) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
  return response;
}

export function clearSessionCookie(response) {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
  });
  return response;
}

// ── Route guards ─────────────────────────────────────────────────────────────

const unauthorized = () => ({ user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });

export async function requireAuth(request) {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return unauthorized();
  const user = await liveUser(await verifyToken(token));
  if (!user) return unauthorized();
  return { user, error: null };
}

// Any admin — which includes everyone in Operations (Mike, 2026-09-14).
export async function requireAdmin(request) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  if (!actsAsAdmin(user)) {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, error: null };
}

// Gate on Sales Admin (or Super Admin). Permissions come from the live account.
export async function requireSalesAdmin(request) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  if (!isSalesAdmin(user)) {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, error: null };
}

// The sales team: any admin, a Sales Admin, a Sales login, or anyone in Sales + marketing.
export function isSalesTeam(user) {
  return !!user && (actsAsAdmin(user) || isSalesAdmin(user) || user.role === 'SALES' || hasDepartment(user, SALES_MARKETING));
}

// Who can work the web budget request queue: any admin, plus anyone in the
// Sales + marketing department (Mike, 2026-09-12 — sales follows up on every
// new request). Departments come from the live account.
export async function requireIntakeReviewer(request) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  if (actsAsAdmin(user) || hasDepartment(user, SALES_MARKETING)) return { user, error: null };
  return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

// Gate on one row of the permission table (src/lib/permissions.js). The 403
// says in plain words who can do it.
export async function requirePermission(request, action) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  if (!can(user, action)) {
    return { user: null, error: NextResponse.json({ error: deniedMessage(action) }, { status: 403 }) };
  }
  return { user, error: null };
}

export async function requireSuperAdmin(request) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  if (!isSuperAdmin(user.role)) {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, error: null };
}

// Legacy alias
export const requireILCAdmin = requireSuperAdmin;
