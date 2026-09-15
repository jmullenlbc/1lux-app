import { NextResponse } from 'next/server';
import { getSession, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { putQcObject, getQcObjectUrl } from '@/lib/qcStorage';

export const dynamic = 'force-dynamic';

// Client standards are open to everyone on staff (Mike, 2026-09-14); contractors
// (Client Viewers) never see them. This used to let only Super Admins and people
// whose permissions said `clients: true` in — a value the Users screen never saves.
const staff = s => canSeeAllData(s);
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };

// The editable columns of a client standard fixture row (no SKU-locking — the exact
// manufacturer/catalog is picked per project, but left editable here as optional hints).
const FIELDS = ['typeCode', 'location', 'description', 'priceTarget', 'productUrl', 'manufacturer',
  'catalogNumber', 'finish', 'cct', 'lumens', 'wattage', 'voltage', 'dimming', 'mounting', 'notes', 'sortOrder'];

async function withUrl(row) {
  return { ...row, imageUrl: row.imageKey ? await getQcObjectUrl(row.imageKey) : null };
}
function pickFields(b) {
  const data = {};
  for (const f of FIELDS) {
    if (b[f] === undefined) continue;
    if (f === 'priceTarget') data.priceTarget = b.priceTarget === '' || b.priceTarget == null ? null : Number(b.priceTarget);
    else if (f === 'sortOrder') data.sortOrder = Number(b.sortOrder) || 0;
    else data[f] = b[f] || null;
  }
  return data;
}

// GET /api/clients/[id]/standard-fixtures — the client's standard fixture schedule.
export async function GET(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const rows = await prisma.clientStandardFixture.findMany({
    where: { clientId: params.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({ fixtures: await Promise.all(rows.map(withUrl)) });
}

// POST — add a row (blank, or seeded from an approved concept via conceptId).
export async function POST(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const data = { clientId: params.id, ...pickFields(b) };

  // Seed from an approved product option: carry its picture + target price.
  if (b.optionId) {
    const o = await prisma.clientProductOption.findUnique({ where: { id: b.optionId } });
    if (o && o.clientId === params.id) {
      data.optionId = o.id;
      data.imageKey = o.imageKey || null;
      if (data.priceTarget == null) data.priceTarget = o.priceTarget ?? null;
      if (!data.description) data.description = o.name || '';
      if (!data.productUrl) data.productUrl = o.productUrl || null;
    }
  }

  const row = await prisma.clientStandardFixture.create({ data });
  return NextResponse.json({ fixture: await withUrl(row) }, { status: 201 });
}

// PATCH { rowId, ...fields, imageBase64?, imageContentType? }
export async function PATCH(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.rowId) return NextResponse.json({ error: 'rowId required' }, { status: 400 });
  const existing = await prisma.clientStandardFixture.findUnique({ where: { id: b.rowId } });
  if (!existing || existing.clientId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = pickFields(b);
  if (b.imageBase64) {
    const ct = b.imageContentType || 'image/png';
    const buffer = Buffer.from(b.imageBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    data.imageKey = await putQcObject(buffer, { ext: EXT[ct] || 'png', contentType: ct });
  }
  const row = await prisma.clientStandardFixture.update({ where: { id: b.rowId }, data });
  return NextResponse.json({ fixture: await withUrl(row) });
}

// DELETE ?rowId=
export async function DELETE(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rowId = new URL(req.url).searchParams.get('rowId');
  if (!rowId) return NextResponse.json({ error: 'rowId required' }, { status: 400 });
  const existing = await prisma.clientStandardFixture.findUnique({ where: { id: rowId } });
  if (!existing || existing.clientId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.clientStandardFixture.delete({ where: { id: rowId } });
  return NextResponse.json({ ok: true });
}
