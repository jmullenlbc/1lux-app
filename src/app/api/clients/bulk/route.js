import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { readBulkIds, emptyBulk, applyBulk, pickText, readActive } from '@/lib/bulkEdit';

// POST /api/clients/bulk (Mike 10-29: pick many companies, edit or archive them).
//   { ids: [...], set: { city?, state?, branchMarket?, active? } }
// Staff only; client logins see their own records one at a time.

const TEXT = ['city', 'state', 'branchMarket'];

export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canSeeAllData(user)) return NextResponse.json({ error: 'Client logins cannot edit companies in bulk. Nothing was changed. (CLIENT_BULK_STAFF)' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const { ids, error: idErr } = readBulkIds(body, 'company', 'CLIENT_BULK');
  if (idErr) return idErr;
  const data = pickText(body?.set, TEXT);
  if (data.state) data.state = data.state.toUpperCase();
  const active = readActive(body?.set);
  if (!Object.keys(data).length && active === undefined) return emptyBulk('CLIENT_BULK');
  return NextResponse.json(await applyBulk({ model: 'client', entityType: 'CLIENT', ids, data, active, user }));
}
