import { createHmac } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * Password on the public /conceptual_budget tool (Mike 10-7: "password
 * protected for now, something simple"). One shared password, kept in the
 * AppSetting row `conceptual_budget_password`; admins change it on
 * Admin > Web budget requests. An empty value opens the tool to everyone.
 *
 * A visitor who types the right password gets a cookie holding an HMAC of the
 * password, so changing the password signs everyone out at once. Signed-in
 * staff never see the gate. The visit and bug-report routes stay open.
 */
export const PUBLIC_BUDGET_PASSWORD_KEY = 'conceptual_budget_password';
const COOKIE = 'cb_access';
const SECRET = process.env.JWT_SECRET || 'ilc-studios-secret';

// Fails closed: if the row is missing or the read fails, the starting password
// (seeded by migration 0120) applies. Only an admin saving an empty value opens it.
const STARTING_PASSWORD = 'Lighitngbudget01';

export async function getPublicBudgetPassword() {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: PUBLIC_BUDGET_PASSWORD_KEY } });
    return row ? row.value.trim() : STARTING_PASSWORD;
  } catch {
    return STARTING_PASSWORD;
  }
}

export async function setPublicBudgetPassword(value, userId) {
  const v = String(value || '').trim();
  return prisma.appSetting.upsert({
    where:  { key: PUBLIC_BUDGET_PASSWORD_KEY },
    create: { key: PUBLIC_BUDGET_PASSWORD_KEY, value: v, updatedById: userId || null },
    update: { value: v, updatedById: userId || null },
  });
}

export function accessTokenFor(password) {
  return createHmac('sha256', SECRET).update(`cb:${password}`).digest('hex');
}

/** True when the tool is open, the visitor holds a valid cookie, or staff are signed in. */
export async function hasPublicBudgetAccess() {
  const password = await getPublicBudgetPassword();
  if (!password) return true;
  const token = cookies().get(COOKIE)?.value;
  if (token && token === accessTokenFor(password)) return true;
  const session = await getSession();
  return !!session;
}

export async function requirePublicBudgetAccess() {
  if (await hasPublicBudgetAccess()) return { error: null };
  return { error: NextResponse.json({ error: 'Password required', code: 'PASSWORD_REQUIRED' }, { status: 401 }) };
}

export function setPublicAccessCookie(response, password) {
  response.cookies.set(COOKIE, accessTokenFor(password), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30,
    path:     '/',
  });
  return response;
}
