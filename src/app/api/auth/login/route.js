import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { signToken, setSessionCookie } from '@/lib/auth';

export async function POST(request) {
    try {
          const { email, password } = await request.json();

      if (!email || !password) {
              return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
      }

      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

      if (!user || !user.passwordHash) {
              return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) {
                  return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
          }

      if (user.isActive === false) {
              return NextResponse.json({ error: 'Your account has been deactivated. Contact an administrator.' }, { status: 403 });
      }

      const token = await signToken({
              id:                user.id,
              email:             user.email,
              name:              user.name,
              role:              user.role,
              mustChangePassword: user.mustChangePassword || false,
      });

      const response = NextResponse.json({
              user: {
                        id:                user.id,
                        email:             user.email,
                        name:              user.name,
                        role:              user.role,
                        mustChangePassword: user.mustChangePassword || false,
              },
      });

      return setSessionCookie(response, token);
    } catch (err) {
          console.error('login error:', err);
          return NextResponse.json({
                  error: 'Internal server error',
                  debug: err.message,
                  hint: String(err),
          }, { status: 500 });
    }
}
