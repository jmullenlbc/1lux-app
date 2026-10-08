import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/market-intel/tags[?kind=METRO&q=den&limit=50]
// Tag rows with how many articles carry each, for the filter pickers and the
// tag search box (0122). Without a kind it returns every kind grouped.
export async function GET(request) {
  const { error } = await requireAuth(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const kind  = searchParams.get('kind')?.trim() || null;
  const q     = searchParams.get('q')?.trim().toLowerCase() || '';
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '200', 10)));

  const where = {};
  if (kind) where.kind = kind;
  if (q)    where.normalized = { contains: q };

  const rows = await prisma.marketTag.findMany({
    where,
    select:  { id: true, kind: true, name: true, normalized: true, clientId: true, client: { select: { id: true, name: true } }, _count: { select: { links: true } } },
    orderBy: [{ links: { _count: 'desc' } }, { name: 'asc' }],
    take:    limit,
  });

  const shaped = rows.map(r => ({ id: r.id, kind: r.kind, name: r.name, normalized: r.normalized, clientId: r.clientId, clientName: r.client?.name || null, count: r._count.links }));
  if (kind) return NextResponse.json({ tags: shaped });

  const grouped = { COMPANY: [], PROJECT: [], METRO: [], STATE: [] };
  for (const t of shaped) (grouped[t.kind] ||= []).push(t);
  return NextResponse.json({ tags: grouped });
}
