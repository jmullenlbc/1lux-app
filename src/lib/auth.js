import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

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
  return parsePermissions(user.permissions).salesAdmin === true;
}

export function getRoleLabel(role) {
  const map = {
    SUPER_ADMIN:    'Super Admin',
    ILC_ADMIN:      'Super Admin',
    COMPANY_ADMIN:  'Company Admin',
    ADMIN:          'Company Admin',
    USER:           'User',
    CLIENT_VIEWER:  'Client Viewer',
  };
  return map[role] || role;
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

export async function getSession() {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifyToken(token);
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

export async function requireAuth(request) {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const payload = await verifyToken(token);
  if (!payload) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user: payload, error: null };
}

export async function requireAdmin(request) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  if (!isAnyAdmin(user.role)) {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, error: null };
}

// Gate on Sales Admin (or Super Admin). Permissions aren't in the JWT, so for
// non-super-admins we look up the user's permissions from the DB.
export async function requireSalesAdmin(request) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  if (isSuperAdmin(user.role)) return { user, error: null };

  // Lazy import to avoid a hard dependency in edge/middleware contexts.
  const { prisma } = await import('@/lib/db');
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { permissions: true } });
  if (!isSalesAdmin({ role: user.role, permissions: dbUser?.permissions })) {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
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
