import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { email, role } = await request.json();

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const allowedRoles = ['USER', 'ADMIN'];
  const assignedRole = allowedRoles.includes(role) ? role : 'USER';

  // ILC_ADMIN cannot be assigned through invite
  if (user.role !== 'ILC_ADMIN' && assignedRole === 'ADMIN') {
    return NextResponse.json({ error: 'Only ILC Admins can create Admins' }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing && existing.passwordHash) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  const inviteToken  = crypto.randomBytes(32).toString('hex');
  const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invited = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { inviteToken, inviteExpiry, role: assignedRole },
    create: {
      email:       email.toLowerCase(),
      role:        assignedRole,
      inviteToken,
      inviteExpiry,
      invitedById: user.id,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const inviteUrl = `${appUrl}/register?token=${inviteToken}`;

  return NextResponse.json({
    success: true,
    inviteUrl,
    user: {
      id:    invited.id,
      email: invited.email,
      role:  invited.role,
    },
  });
}

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const users = await prisma.user.findMany({
    select: {
      id:          true,
      email:       true,
      name:        true,
      role:        true,
      createdAt:   true,
      inviteToken: true,
      inviteExpiry:true,
      passwordHash:true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    users: users.map(u => ({
      ...u,
      passwordHash: undefined,
      hasPassword:  !!u.passwordHash,
      isPending:    !u.passwordHash && !!u.inviteToken,
    })),
  });
}
