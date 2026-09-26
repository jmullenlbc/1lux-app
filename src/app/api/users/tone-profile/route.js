import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma }       from '@/lib/db';

// Uploads moved to /api/sales/voice (the voice library, Mike 9-26); the
// Profile page and Sales > Automation > Voice Training both use it.

// ── GET /api/users/tone-profile ───────────────────────────────────────────────
// Returns the current user's tone profile

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const u = await prisma.user.findUnique({
    where:  { id: user.id },
    select: { toneProfile: true, toneProfileBuiltAt: true, toneProfileSource: true, name: true },
  });

  if (!u?.toneProfile) return NextResponse.json({ profile: null });

  try {
    return NextResponse.json({
      profile:   JSON.parse(u.toneProfile),
      builtAt:   u.toneProfileBuiltAt,
      source:    u.toneProfileSource,
      userName:  u.name,
    });
  } catch {
    return NextResponse.json({ profile: null });
  }
}
