import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer, isSalesAdmin } from '@/lib/auth';
import { listTaskTags, addTaskTag } from '@/lib/desk/tasksServer';

export const dynamic = 'force-dynamic';

// GET: every live tag. POST { name }: add one, or get back the one with that name.
// Only a Sales Admin can add one (Mike 11-1).
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ tags: await listTaskTags() });
}

export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!isSalesAdmin(user)) return NextResponse.json({ error: 'Only a Sales Admin can make a new tag. Nothing was saved. Ask a Sales Admin to add it.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const out = await addTaskTag(user, body?.name);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out);
}
