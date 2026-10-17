import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { companyBudgets } from '@/lib/intake/portalServer';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC (behind the shared tool password). POST { email } answers every web
 * budget from that email's company, grouped by project, with the "same
 * project?" questions this person gets to answer (0132, Mike 10-16).
 * Work emails only; a personal email is refused with the same words the
 * wizard uses.
 */
const LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
  const gate = rateLimit(`intake-portal-list:${clientIp(req)}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } });
  }
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const out = await companyBudgets(body?.email);
  if (out.error) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json(out);
}
