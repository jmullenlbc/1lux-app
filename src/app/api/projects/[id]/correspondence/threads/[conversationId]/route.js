import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/[id]/correspondence/threads/[conversationId]
// Returns all messages in the thread (oldest first) with attachments.
// Company resolved from Contact model by fromEmail (batched, not per-message).
export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const messages = await prisma.emailMessage.findMany({
    where:   { projectId: params.id, conversationId: params.conversationId },
    orderBy: { receivedAt: 'asc' },
    include: {
      attachments: {
        select: { id: true, filename: true, size: true, mimeType: true },
      },
      // Tags as rows (0118), beside the legacy JSON tags.
      messageTags: { select: { tagKey: true, tag: { select: { label: true, color: true } } } },
    },
  });

  if (!messages.length) {
    return NextResponse.json({ messages: [] });
  }

  // Batch company lookup, one query per unique fromEmail
  const uniqueEmails = [...new Set(messages.map(m => m.fromEmail))];
  const contacts = await prisma.contact.findMany({
    where: { email: { in: uniqueEmails } },
    select: { email: true, client: { select: { name: true } } },
  });
  const companyByEmail = {};
  for (const c of contacts) {
    if (c.client?.name) companyByEmail[c.email] = c.client.name;
  }

  const result = messages.map(m => ({
    id:                m.id,
    fromName:          m.fromName,
    fromEmail:         m.fromEmail,
    company:           companyByEmail[m.fromEmail] ?? undefined,
    bodyHtml:          m.bodyHtml,
    bodyPreview:       m.bodyPreview,
    receivedAt:        m.receivedAt,
    isRead:            m.isRead,
    tags:              (() => { try { return JSON.parse(m.tags || '[]'); } catch { return []; } })(),
    messageTags:       (m.messageTags || []).map(t => ({ key: t.tagKey, label: t.tag?.label || t.tagKey, color: t.tag?.color || null })),
    hasAttachments:    m.hasAttachments,
    attachments:       m.attachments,
    webUrl:            m.webUrl,
    internetMessageId: m.internetMessageId,
    inReplyTo:         m.inReplyTo,
  }));

  return NextResponse.json({ messages: result });
}
