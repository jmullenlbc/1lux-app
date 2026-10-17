import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { loadPricing, savePricing } from '@/lib/pricingLoader';

// The master pricing sheet: Pre-construction, Operations and admins (Mike,
// 2026-09-14: "only someone in pre-con or a company admin can touch the master
// pricing list"). This used to let in only the old ILC_ADMIN role name, which
// turned away a Super Admin.

// GET /api/admin/pricing, returns current pricing config
export async function GET(req) {
  const { error } = await requirePermission(req, 'editMasterPricing');
  if (error) return error;
  const pricing = await loadPricing();
  return NextResponse.json({ pricing });
}

// PUT /api/admin/pricing, saves new pricing config
export async function PUT(req) {
  const { user, error } = await requirePermission(req, 'editMasterPricing');
  if (error) return error;
  const { pricing } = await req.json();
  const saved = await savePricing(pricing, user.id);
  return NextResponse.json({ pricing: saved });
}
