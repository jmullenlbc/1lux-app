import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { addCompanyTagToCrm } from '@/lib/market-intel/addToCrm';
import { SIGNAL_INCLUDE } from '../../route';

/**
 * POST /api/market-intel/signals/[id]/add-to-crm   { tagId }
 * Makes the named company a CRM client (or reuses one with that name) and
 * links this signal to it. Returns the refreshed signal plus the client.
 */
export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (user.role === 'CLIENT_VIEWER') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { tagId } = await request.json().catch(() => ({}));
  if (!tagId) return NextResponse.json({ error: 'tagId is required' }, { status: 400 });

  try {
    const { client, created } = await addCompanyTagToCrm({ signalId: params.id, tagId, userId: user.id || user.userId });
    const signal = await prisma.marketSignal.findUnique({ where: { id: params.id }, include: SIGNAL_INCLUDE });
    return NextResponse.json({ ok: true, client, created, signal });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
