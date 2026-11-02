import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { coProducts } from '@/lib/changeOrderProductStart';

// GET /api/projects/[id]/change-orders/products
// Each product's running record across the job's change orders.
export async function GET(_req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  // Carries ILC's buy price. Contractors see change orders only through the client portal.
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ products: await coProducts(params.id) });
}
