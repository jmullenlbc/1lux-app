import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireAuth, signToken, setSessionCookie } from '@/lib/auth';

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { password } = await request.json();

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data:  { passwordHash, mustChangePassword: false },
  });

  // Re-issue JWT without mustChangePassword flag
  const token = await signToken({
    id:                user.id,
    email:             user.email,
    name:              user.name,
    role:              user.role,
    mustChangePassword: false,
  });

  const response = NextResponse.json({ ok: true });
  return setSessionCookie(response, token);
}
