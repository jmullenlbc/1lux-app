import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { companyProjectNames } from '@/lib/intake/portalServer';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC (behind the shared tool password). POST { email } answers the
 * project names the email's company already used, for the wizard's Project
 * name autofill (0132, Mike 10-16). Names only, never a number.
 */
const LIMIT = { limit: 30, windowMs: 60_000 };

export async function POST(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
  const gate = rateLimit(`intake-portal-names:${clientIp(req)}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } });
  }
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const out = await companyProjectNames(body?.email);
  if (out.error) return NextResponse.json({ names: [] });
  return NextResponse.json(out);
}
