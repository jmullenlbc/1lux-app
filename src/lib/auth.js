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
