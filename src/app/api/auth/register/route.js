import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { signToken, setSessionCookie } from '@/lib/auth';

export async function POST(request) {
  try {
    const { token, name, password } = await request.json();

    if (!token || !name || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { inviteToken: token } });

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 400 });
    }

    if (user.inviteExpiry && new Date(user.inviteExpiry) < new Date()) {
      return NextResponse.json({ error: 'This invite link has expired' }, { status: 400 });
    }

    if (user.passwordHash) {
      return NextResponse.json({ error: 'This account is already set up' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        passwordHash,
        inviteToken:  null,
        inviteExpiry: null,
      },
    });

    const jwtToken = await signToken({
      id:    updated.id,
      email: updated.email,
      name:  updated.name,
      role:  updated.role,
    });

    const response = NextResponse.json({
      user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role },
    });

    return setSessionCookie(response, jwtToken);
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
