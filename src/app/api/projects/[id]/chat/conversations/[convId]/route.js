import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return user.role === 'ILC_ADMIN' || project.createdById === user.id;
}

// GET /api/projects/[id]/chat/conversations/[convId] — load messages
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const conversation = await prisma.chatConversation.findFirst({
    where:   { id: params.convId, projectId: params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    id:       conversation.id,
    title:    conversation.title || 'Untitled conversation',
    createdAt: conversation.createdAt,
    messages: conversation.messages.map(m => ({
      id:        m.id,
      role:      m.role,
      content:   m.content,
      createdAt: m.createdAt,
    })),
  });
}

// DELETE /api/projects/[id]/chat/conversations/[convId] — delete one conversation
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.chatConversation.deleteMany({
    where: { id: params.convId, projectId: params.id },
  });
  return NextResponse.json({ ok: true });
}
