import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readBulkIds, emptyBulk, applyBulk, pickText, readActive } from '@/lib/bulkEdit';
import { isSettableContactDepartment } from '@/lib/contactDepartments';

// POST /api/crm/contacts/bulk (Mike 10-29: pick many people, edit or archive them).
//   { ids: [...], set: { title?, department?, clientId?, active? } }
// department must be one of Mike's eight keys, or blank to clear it.
// clientId is a company or one of its branches (a branch is its own Client).
// The typed employer text stays as it was.

export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!canSeeAllData(user)) return NextResponse.json({ error: 'Client logins cannot edit people in bulk. Nothing was changed. (CONTACT_BULK_STAFF)' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const { ids, error: idErr } = readBulkIds(body, 'person', 'CONTACT_BULK');
  if (idErr) return idErr;
  const data = pickText(body?.set, ['title', 'department']);
  if (data.department && !isSettableContactDepartment(data.department)) {
    return NextResponse.json({ error: 'That department is not on the list. Pick one of the eight. Nothing was changed. (CONTACT_BULK_DEPT)' }, { status: 400 });
  }
  if ('clientId' in (body?.set || {})) {
    const clientId = typeof body.set.clientId === 'string' && body.set.clientId.trim() ? body.set.clientId.trim() : null;
    if (clientId && !await prisma.client.findFirst({ where: { id: clientId }, select: { id: true } })) {
      return NextResponse.json({ error: 'That company is not in the CRM, or it was archived. Pick another. Nothing was changed. (CONTACT_BULK_COMPANY)' }, { status: 400 });
    }
    data.clientId = clientId;
  }
  const active = readActive(body?.set);
  if (!Object.keys(data).length && active === undefined) return emptyBulk('CONTACT_BULK');
  return NextResponse.json(await applyBulk({ model: 'contact', entityType: 'CONTACT', ids, data, active, user }));
}
