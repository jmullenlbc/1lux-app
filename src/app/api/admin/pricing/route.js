import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { loadPricing, savePricing } from '@/lib/pricingLoader';

// GET /api/admin/pricing — returns current pricing config
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (user.role !== 'ILC_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const pricing = await loadPricing();
  return NextResponse.json({ pricing });
}

// PUT /api/admin/pricing — saves new pricing config
export async function PUT(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (user.role !== 'ILC_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { pricing } = await request.json();
  const saved = await savePricing(pricing, user.id);
  return NextResponse.json({ pricing: saved });
}
