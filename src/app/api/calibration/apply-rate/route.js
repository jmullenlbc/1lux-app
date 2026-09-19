import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { loadPricing, savePricing } from '@/lib/pricingLoader';
import { isAppliablePricingKey, readPricingKey, withPricingKey } from '@/lib/calibration/lines';
import { parseLooseNumber } from '@/lib/numberInput';

export const dynamic = 'force-dynamic';

// POST /api/calibration/apply-rate { pricingKey, rate }
// Writes one suggested rate from the calibration table into the master
// pricing sheet (same store /admin/pricing edits). Same gate as that page.
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (user.role !== 'ILC_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const key  = String(b.pricingKey || '');
  const rate = parseLooseNumber(b.rate);
  if (!isAppliablePricingKey(key))            return NextResponse.json({ error: 'That pricing key cannot be set from calibration' }, { status: 400 });
  if (!Number.isFinite(rate) || rate <= 0)    return NextResponse.json({ error: 'rate must be a positive number' }, { status: 400 });

  const current  = await loadPricing();
  const previous = readPricingKey(current, key);
  if (previous == null) return NextResponse.json({ error: 'Pricing key not found on the sheet' }, { status: 404 });

  const rounded = Math.round(rate * 10000) / 10000;
  const saved = await savePricing(withPricingKey(current, key, rounded), user.id);
  return NextResponse.json({ pricingKey: key, previous, rate: readPricingKey(saved, key) ?? rounded });
}
