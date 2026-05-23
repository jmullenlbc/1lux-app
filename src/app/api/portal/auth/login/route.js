import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { signPortalToken, setPortalSessionCookie } from '@/lib/portalAuth';

/**
 * POST /api/portal/auth/login
 * Authenticate a portal user with email + password.
 */
export async function POST(req) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const portalUser = await prisma.portalUser.findUnique({ where: { email: email.toLowerCase().trim() } });

  if (!portalUser) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, portalUser.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  // Verify user still has at least one active project contact
  const contactCount = await prisma.projectExternalContact.count({
    where: { portalUserId: portalUser.id, acceptedAt: { not: null } },
  });

  if (contactCount === 0) {
    return NextResponse.json({ error: 'No active project access. Contact your ILC project manager.' }, { status: 403 });
  }

  const token    = await signPortalToken({ portalUserId: portalUser.id, email: portalUser.email, name: portalUser.name });
  const response = NextResponse.json({ success: true, name: portalUser.name });
  setPortalSessionCookie(response, token);
  return response;
}
