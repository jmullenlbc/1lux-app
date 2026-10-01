import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * PATCH one answer row.
 *   { action: 'link', clientId }  the company was added to (or found in) the CRM
 *   { action: 'dismiss' }         not useful; kept, shown greyed
 *   { action: 'restore' }
 * Nothing is added to the CRM on its own: a person presses "Add to CRM".
 */
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canSeeAllData(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { action, clientId } = await req.json().catch(() => ({}));

  let data;
  if (action === 'link') {
    const client = clientId && await prisma.client.findUnique({ where: { id: String(clientId) }, select: { id: true } });
    if (!client) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    data = { clientId: client.id, matchStatus: 'ADDED', status: 'ADDED' };
  } else if (action === 'dismiss') data = { status: 'DISMISSED' };
  else if (action === 'restore') data = { status: 'NEW' };
  else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  const row = await prisma.marketAnswerRow.update({
    where: { id: params.id }, data,
    select: { id: true, status: true, matchStatus: true, client: { select: { id: true, name: true } } },
  }).catch(() => null);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ row });
}
