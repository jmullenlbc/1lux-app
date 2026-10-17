/**
 * Portal authentication, separate from ILC admin auth.
 * Used for external contractor/client portal sessions.
 * Cookie: portal_token (httpOnly, 30-day expiry)
 * JWT payload: { portalUserId, email, name }
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const SECRET      = new TextEncoder().encode(process.env.PORTAL_JWT_SECRET || process.env.JWT_SECRET || 'ilc-portal-secret');
const COOKIE_NAME = 'portal_token';

export async function signPortalToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET);
}

export async function verifyPortalToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function getPortalSession() {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifyPortalToken(token);
}

export function setPortalSessionCookie(response, token) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30, // 30 days
    path:     '/',
  });
  return response;
}

export function clearPortalSessionCookie(response) {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    maxAge:   0,
    path:     '/',
  });
  return response;
}

/**
 * Route guard for portal API endpoints.
 * Returns { portalUser, error }, portalUser is the JWT payload.
 */
export async function requirePortalAuth() {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return { portalUser: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const payload = await verifyPortalToken(token);
  if (!payload) {
    return { portalUser: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { portalUser: payload, error: null };
}
