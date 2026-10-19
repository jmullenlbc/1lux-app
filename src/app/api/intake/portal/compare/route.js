import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { compareCompanyBudgets } from '@/lib/intake/portalServer';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC (behind the shared tool password). POST { email, draftIds } answers
 * two or three of the company's budgets side by side (Mike 10-17): facts,
 * totals, the breakdown line by line and the answers behind each, with the
 * rows that differ marked. Public dollars only, never a rate.
 */
const LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
  const gate = rateLimit(`intake-portal-compare:${clientIp(req)}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } });
  }
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const out = await compareCompanyBudgets(body?.email, body?.draftIds);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status || 422 });
  return NextResponse.json(out);
}
