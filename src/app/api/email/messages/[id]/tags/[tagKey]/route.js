import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// DELETE /api/email/messages/[id]/tags/[tagKey]
// Takes a tag off an email. The link row is the only thing removed; the tag
// and the email stay.
export async function DELETE(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  await prisma.emailMessageTag.deleteMany({ where: { messageId: params.id, tagKey: params.tagKey } });
  return NextResponse.json({ ok: true });
}
