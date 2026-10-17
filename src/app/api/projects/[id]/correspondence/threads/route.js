import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/[id]/correspondence/threads
// Returns all threads for a project, grouped by conversationId, sorted by
// latestReceivedAt desc. Each thread is a summary, no bodyHtml.
export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const messages = await prisma.emailMessage.findMany({
    where:   { projectId: params.id },
    orderBy: { receivedAt: 'asc' },
    select: {
      id: true, conversationId: true, subject: true, bodyPreview: true,
      fromEmail: true, fromName: true, receivedAt: true, isRead: true, tags: true,
    },
  });

  if (!messages.length) {
    return NextResponse.json({ threads: [] });
  }

  // Group by conversationId (messages already sorted asc → latest is last)
  const convMap = new Map();
  for (const msg of messages) {
    if (!convMap.has(msg.conversationId)) convMap.set(msg.conversationId, []);
    convMap.get(msg.conversationId).push(msg);
  }

  const threads = Array.from(convMap.entries()).map(([convId, msgs]) => {
    const latest      = msgs[msgs.length - 1];
    const unreadCount = msgs.filter(m => !m.isRead).length;
    // Union of all tags across messages in thread
    const tagSet = new Set();
    for (const m of msgs) {
      try { JSON.parse(m.tags || '[]').forEach(t => tagSet.add(t)); } catch {}
    }
    return {
      conversationId:    convId,
      subject:           latest.subject,
      latestPreview:     latest.bodyPreview || '',
      senderName:        latest.fromName || latest.fromEmail,
      senderEmail:       latest.fromEmail,
      tags:              [...tagSet],
      messageCount:      msgs.length,
      unreadCount,
      latestReceivedAt:  latest.receivedAt,
    };
  });

  // Sort by latestReceivedAt descending
  threads.sort((a, b) => new Date(b.latestReceivedAt) - new Date(a.latestReceivedAt));

  return NextResponse.json({ threads });
}
