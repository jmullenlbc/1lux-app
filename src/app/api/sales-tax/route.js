import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { lookupSalesTax } from '@/lib/salesTaxLookup';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sales-tax?state=WA&zip=98101 → { pct, basis }
 * The estimated sales tax for a project location. Open to staff and to the
 * public budget tool (same gate as its estimate route).
 */
export async function GET(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
  const gate = rateLimit(`sales-tax:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if (!gate.allowed) return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  const { searchParams } = new URL(req.url);
  const state = String(searchParams.get('state') || '').slice(0, 2);
  const zip = String(searchParams.get('zip') || '').slice(0, 10);
  return NextResponse.json(await lookupSalesTax({ state, zip }));
}
