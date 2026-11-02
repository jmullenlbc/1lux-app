import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { lookupRecords } from '@/lib/desk/tasksServer';

export const dynamic = 'force-dynamic';

// GET ?kind=client|project&q=: company and project search for the task form.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const kind = sp.get('kind') === 'client' ? 'client' : 'project';
  return NextResponse.json({ rows: await lookupRecords(kind, sp.get('q')) });
}
