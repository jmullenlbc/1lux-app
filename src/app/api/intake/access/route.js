import { NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { getPublicBudgetPassword, setPublicAccessCookie } from '@/lib/publicAccess';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC. The visitor types the shared password for /conceptual_budget.
 * POST { password } -> sets the access cookie (30 days) or 401.
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
  return setPublicAccessCookie(NextResponse.json({ ok: true }), password);
}
