import { NextResponse } from 'next/server';
import { requirePermission, isAnyAdmin } from '@/lib/auth';
import { approveChangeOrder, undoApproval } from '@/lib/changeOrderApproval';

// POST, staff record a client's phone or email approval, or an admin undoes one.
// Clients approve from the portal. { note, undo }
export async function POST(req, { params }) {
  const { user, error } = await requirePermission(req, 'editJobMoney');
  if (error) return error;

  const { note, undo } = await req.json().catch(() => ({}));
  const how = typeof note === 'string' ? note.trim() : '';

  if (undo) {
    if (!isAnyAdmin(user.role)) {
      return NextResponse.json({ error: 'Only an admin can undo an approval. Nothing was changed.' }, { status: 403 });
    }
    const { status, body } = await undoApproval({ projectId: params.id, coId: params.coId, userId: user.id, note: how || null });
    return NextResponse.json(body, { status });
  }

  if (!how) {
    return NextResponse.json({ error: 'Say how the client approved, such as by phone or email. Nothing was changed.' }, { status: 400 });
  }
  const { status, body } = await approveChangeOrder({
    projectId: params.id, coId: params.coId, via: 'STAFF', from: ['DRAFT', 'SENT'], userId: user.id, note: how,
  });
  return NextResponse.json(body, { status });
}
