import { NextResponse } from 'next/server';
import { getSession, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { putQcObject, getQcObjectUrl } from '@/lib/qcStorage';
import { looseNumberOrNull, looseInteger } from '@/lib/numberInput';

export const dynamic = 'force-dynamic';

// Client standards are open to everyone on staff (Mike, 2026-09-14); contractors
// (Client Viewers) never see them. This used to let only Super Admins and people
// whose permissions said `clients: true` in — a value the Users screen never saves.
const staff = s => canSeeAllData(s);
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
const FIELDS = ['category', 'name', 'productUrl', 'notes', 'priceEstimate', 'priceTarget', 'sortOrder'];

async function withUrl(o) {
  return { ...o, imageUrl: o.imageKey ? await getQcObjectUrl(o.imageKey) : null };
}
function pickFields(b) {
  const data = {};
  for (const f of FIELDS) {
    if (b[f] === undefined) continue;
    if (f === 'priceEstimate' || f === 'priceTarget') data[f] = looseNumberOrNull(b[f]);
    else if (f === 'sortOrder') data.sortOrder = looseInteger(b.sortOrder) || 0;
    else data[f] = b[f] || null;
  }
  return data;
}

// GET — all product options for the client (client groups them by category).
export async function GET(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rows = await prisma.clientProductOption.findMany({
    where: { clientId: params.id }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({ options: await Promise.all(rows.map(withUrl)) });
}

// POST — add an option to a category.
export async function POST(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const row = await prisma.clientProductOption.create({ data: { clientId: params.id, ...pickFields(b) } });
  return NextResponse.json({ option: await withUrl(row) }, { status: 201 });
}

// PATCH { optionId, ...fields, status?, imageBase64? } — edit / approve / reject.
// Or { renameCategory: { from, to } } — rename a whole category.
export async function PATCH(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));

  // Bulk: rename an entire category.
  if (b.renameCategory && typeof b.renameCategory.to === 'string') {
    await prisma.clientProductOption.updateMany({
      where: { clientId: params.id, category: b.renameCategory.from || '' },
      data: { category: b.renameCategory.to.trim() },
    });
    return NextResponse.json({ ok: true });
  }

  if (!b.optionId) return NextResponse.json({ error: 'optionId required' }, { status: 400 });
  const existing = await prisma.clientProductOption.findUnique({ where: { id: b.optionId } });
  if (!existing || existing.clientId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = pickFields(b);
  if (b.status !== undefined && ['PENDING', 'APPROVED', 'REJECTED'].includes(b.status)) data.status = b.status;
  if (b.imageKey !== undefined) data.imageKey = b.imageKey || null;   // from link-preview unfurl
  if (b.imageBase64) {
    const ct = b.imageContentType || 'image/png';
    const buffer = Buffer.from(b.imageBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    data.imageKey = await putQcObject(buffer, { ext: EXT[ct] || 'png', contentType: ct });
  }
  const row = await prisma.clientProductOption.update({ where: { id: b.optionId }, data });
  return NextResponse.json({ option: await withUrl(row) });
}

// DELETE ?optionId=  |  ?category=  (delete a whole category)
export async function DELETE(req, { params }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!staff(s)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const sp = new URL(req.url).searchParams;

  if (sp.has('category')) {
    await prisma.clientProductOption.deleteMany({ where: { clientId: params.id, category: sp.get('category') || '' } });
    return NextResponse.json({ ok: true });
  }

  const optionId = sp.get('optionId');
  if (!optionId) return NextResponse.json({ error: 'optionId required' }, { status: 400 });
  const existing = await prisma.clientProductOption.findUnique({ where: { id: optionId } });
  if (!existing || existing.clientId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.clientProductOption.delete({ where: { id: optionId } });
  return NextResponse.json({ ok: true });
}
