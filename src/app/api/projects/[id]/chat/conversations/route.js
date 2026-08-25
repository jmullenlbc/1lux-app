import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return canSeeAllData(user) || project.createdById === user.id;
}

// GET /api/projects/[id]/chat/conversations — list all conversations for a project
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const conversations = await prisma.chatConversation.findMany({
    where:   { projectId: params.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true, content: true, role: true },
      },
    },
  });

  return NextResponse.json({
    conversations: conversations.map(c => ({
      id:          c.id,
      title:       c.title || 'Untitled conversation',
      createdAt:   c.createdAt,
      messageCount: c._count.messages,
      lastMessage: c.messages[0] ?? null,
    })),
  });
}

// DELETE /api/projects/[id]/chat/conversations — delete all conversations for a project
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.chatConversation.deleteMany({ where: { projectId: params.id } });
  return NextResponse.json({ ok: true });
}
