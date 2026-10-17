import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEFAULT_MARKET, isKnownMarket } from '@/lib/market-intel/sourceCatalog';

/**
 * Both handlers used to call `getSession()`, never imported, never defined
 * and then read an undefined `user`. Enabling or disabling a source threw a
 * ReferenceError and 500'd. See the sibling route for the same fix.
 */

async function requireSourceAdmin(request) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  if (user.role !== 'ILC_ADMIN' && user.role !== 'SUPER_ADMIN') {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user, error: null };
}

export async function PATCH(request, { params }) {
  const { error } = await requireSourceAdmin(request);
  if (error) return error;

  const body = await request.json();
  const data = {};
  if (body.isActive         !== undefined) data.isActive         = body.isActive;
  if (body.pollingFrequency !== undefined) data.pollingFrequency = body.pollingFrequency;
  if (body.notes            !== undefined) data.notes            = body.notes;
  if (body.market           !== undefined) data.market           = isKnownMarket(body.market) ? body.market : DEFAULT_MARKET;

  const source = await prisma.marketSource.update({ where: { id: params.id }, data });
  return NextResponse.json(source);
}

export async function DELETE(request, { params }) {
  const { error } = await requireSourceAdmin(request);
  if (error) return error;

  await prisma.marketSource.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
