import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer, actsAsAdmin } from '@/lib/auth';
import { updateTask } from '@/lib/desk/tasksServer';

// PATCH: any task field, or { archive: true }. Tasks are archived, never deleted.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const out = await updateTask(user, params.id, body, { isAdmin: actsAsAdmin(user) });
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out);
}
