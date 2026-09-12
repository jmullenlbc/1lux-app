import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const MFR_FIELDS = [
  'name','acctLastUpdated','setupToSell','terms','credit','notes',
  'accountingEmail','ffa','paymentInfo','website','mainPhone',
  'address','address2','city','state','zip',
];

function parseBody(body) {
  const data = {};
  for (const f of MFR_FIELDS) {
    if (!(f in body)) continue;
    if (f === 'setupToSell') { data[f] = Boolean(body[f]); continue; }
    if (f === 'credit' || f === 'ffa') {
      const n = body[f] === '' || body[f] == null ? null : parseFloat(body[f]);
      data[f] = isNaN(n) ? null : n;
      continue;
    }
    data[f] = body[f] === '' ? null : (body[f] ?? null);
    if (typeof data[f] === 'string') data[f] = data[f].trim() || null;
  }
  return data;
}

async function nextMfrNumericId() {
  const agg = await prisma.manufacturer.aggregate({ _max: { numericId: true } });
  return (agg._max.numericId ?? 0) + 1;
}

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const manufacturers = await prisma.manufacturer.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true, numericId: true, name: true, setupToSell: true, terms: true,
      credit: true, ffa: true, accountingEmail: true, mainPhone: true,
      website: true, city: true, state: true, notes: true, acctLastUpdated: true,
      products: { select: { id: true, numericId: true, partNumber: true, description: true, cct: true, wattage: true, dimming: true, finish: true, fixtureType: true }, where: { archivedAt: null }, orderBy: { partNumber: 'asc' } },
    },
  });
  return NextResponse.json({ manufacturers });
}

export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const data = parseBody(body);
  data.numericId = await nextMfrNumericId();
  const manufacturer = await prisma.manufacturer.create({
    data,
    select: { id: true, numericId: true, name: true, setupToSell: true, terms: true, credit: true, ffa: true, accountingEmail: true, mainPhone: true, website: true, city: true, state: true, notes: true, acctLastUpdated: true, products: true },
  });
  return NextResponse.json({ manufacturer }, { status: 201 });
}
