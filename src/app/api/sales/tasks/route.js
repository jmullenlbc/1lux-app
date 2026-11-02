import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer, actsAsAdmin, isSalesAdmin } from '@/lib/auth';
import { loadTasks, loadRecordTasks, createTask } from '@/lib/desk/tasksServer';

export const dynamic = 'force-dynamic';

// GET: the signed-in person's tasks. ?user=<id> is that person's (look-only);
// ?scope=everyone is all of them; ?client=, ?contact= or ?project= is everyone's on
// that record. POST: a new task of your own.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const canMakeTags = isSalesAdmin(user);
  const isAdmin = actsAsAdmin(user);
  const kind = ['client', 'contact', 'project'].find(k => sp.get(k));
  if (kind) return NextResponse.json(await loadRecordTasks({ kind, id: sp.get(kind), viewerId: user.id, isAdmin, canMakeTags }));
  const scope = sp.get('scope') === 'everyone' ? 'everyone' : null;
  const out = await loadTasks({ viewerId: user.id, userId: sp.get('user') || null, scope, isAdmin, canMakeTags });
  return NextResponse.json(out);
}

export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const out = await createTask(user, body);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out, { status: 201 });
}
