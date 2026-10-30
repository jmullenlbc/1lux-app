import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { readBulkIds, emptyBulk, applyBulk, pickText, readActive } from '@/lib/bulkEdit';

// POST /api/products/bulk (Mike 10-29: pick many products, edit or archive them).
//   { ids: [...], set: { finish?, cct?, dimming?, voltage?, mounting?, fixtureType?, notes?, active? } }
// Same people who can edit one product. active:false archives, true restores.

const TEXT = ['fixtureType', 'finish', 'cct', 'dimming', 'voltage', 'mounting', 'notes'];

export async function POST(request) {
  const { user, error } = await requirePermission(request, 'editProducts');
  if (error) return error;
  const body = await request.json().catch(() => null);
  const { ids, error: idErr } = readBulkIds(body, 'product', 'PRODUCT_BULK');
  if (idErr) return idErr;
  const data = pickText(body?.set, TEXT);
  const active = readActive(body?.set);
  if (!Object.keys(data).length && active === undefined) return emptyBulk('PRODUCT_BULK');
  return NextResponse.json(await applyBulk({ model: 'manufacturerProduct', entityType: 'PRODUCT', ids, data, active, user }));
}
