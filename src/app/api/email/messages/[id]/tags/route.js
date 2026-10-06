import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/email/messages/[id]/tags  { tagKey }
// Puts a tag on an email. Already there = fine, same answer.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const tagKey = String(body?.tagKey || '').trim();
  if (!tagKey) return NextResponse.json({ error: 'Which tag?' }, { status: 400 });

  const [message, tag] = await Promise.all([
    prisma.emailMessage.findUnique({ where: { id: params.id }, select: { id: true } }),
    prisma.emailTag.findUnique({ where: { key: tagKey } }),
  ]);
  if (!message) return NextResponse.json({ error: 'Email not found' }, { status: 404 });
  if (!tag || !tag.isActive) return NextResponse.json({ error: 'That tag does not exist.' }, { status: 404 });

  const row = await prisma.emailMessageTag.upsert({
    where:  { messageId_tagKey: { messageId: message.id, tagKey } },
    create: { messageId: message.id, tagKey, taggedById: user.id },
    update: {},
    include: { tag: true },
  });
  return NextResponse.json({ messageTag: row });
}
