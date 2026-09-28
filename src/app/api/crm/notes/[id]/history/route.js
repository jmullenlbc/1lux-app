import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/crm/notes/[id]/history — who changed what on a note, newest first (0108).
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (user.role === 'CLIENT_VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const changes = await prisma.noteChange.findMany({
    where:   { noteId: params.id },
    orderBy: { createdAt: 'desc' },
    take:    300,
  });
  return NextResponse.json({ changes });
}
