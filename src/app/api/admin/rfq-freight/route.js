import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getStartingFreightPct, setStartingFreightPct } from '@/lib/rfq/freightStart';

export const dynamic = 'force-dynamic';

// Shown and typed as a percent; saved as a decimal like every other rate.
const asPercent = (decimal) => Number((decimal * 100).toFixed(4));

// GET { percent }
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  return NextResponse.json({ percent: asPercent(await getStartingFreightPct()) });
}

// PUT { percent: 2 }
export async function PUT(request) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'The page sent something we could not read. Nothing was saved. Reload and try again. (RFQ_FREIGHT_BAD_BODY)' }, { status: 400 });
  }
  const percent = body?.percent === '' || body?.percent == null ? NaN : Number(body.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return NextResponse.json({ error: 'Starting freight must be a percent from 0 to 100. Nothing was saved. (RFQ_FREIGHT_BAD_PERCENT)' }, { status: 400 });
  }
  await setStartingFreightPct(percent / 100, user.id);
  return NextResponse.json({ ok: true, percent });
}
