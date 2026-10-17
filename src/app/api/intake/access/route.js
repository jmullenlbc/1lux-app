import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { classifyIntakeEmail } from '@/lib/intake';
import { deviceKind } from '@/lib/intake/visits';
import { getPublicBudgetPassword, setPublicAccessCookie } from '@/lib/publicAccess';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC. The visitor types the shared password for /conceptual_budget.
 * POST { password, email } -> sets the access cookie (one year) or 401.
 * A right password with a good work email adds a ConceptualSignIn row (0133,
 * Mike 10-17: "record it for data"); a failed write never blocks the sign in.
 * Ten tries a minute per address.
 */
export async function POST(request) {
  const rl = rateLimit(`cb-access:${clientIp(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many tries. Wait a minute and try again.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const password = await getPublicBudgetPassword();
  if (!password) return NextResponse.json({ ok: true, open: true });

  const typed = String(body?.password || '').trim();
  if (typed !== password) {
    return NextResponse.json({ error: 'That password is not right.' }, { status: 401 });
  }
  const check = classifyIntakeEmail(String(body?.email || '').slice(0, 254));
  if (check.ok) {
    await prisma.conceptualSignIn.create({
      data: {
        email: String(body.email).trim().toLowerCase(),
        emailDomain: check.domain,
        deviceKind: deviceKind(request.headers.get('user-agent') || ''),
      },
    }).catch(err => console.error('sign in record failed:', err.message));
  }
  return setPublicAccessCookie(NextResponse.json({ ok: true }), password);
}
