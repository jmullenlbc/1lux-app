import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// PATCH /api/projects/[id]/correspondence/threads/[conversationId]/read
// Marks all messages in the thread as read. Client calls this optimistically —
// UI updates unread state immediately without waiting for the response.
export async function PATCH(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  await prisma.emailMessage.updateMany({
    where: { projectId: params.id, conversationId: params.conversationId },
    data:  { isRead: true },
  });

  return NextResponse.json({ ok: true });
}
