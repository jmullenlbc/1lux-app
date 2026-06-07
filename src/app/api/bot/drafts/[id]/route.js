import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = params;

  const draft = await prisma.botDraft.findUnique({
    where: { id },
    include: {
      deal: {
        select: { id: true, title: true, pipeline: true, stage: true },
      },
    },
  });

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  if (draft.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ draft });
}

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = params;

  const existing = await prisma.botDraft.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  if (existing.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { body: draftBody, subject, toEmail, toName } = body;

  const updated = await prisma.botDraft.update({
    where: { id },
    data: {
      ...(draftBody !== undefined && { body: draftBody }),
      ...(subject !== undefined && { subject }),
      ...(toEmail !== undefined && { toEmail }),
      ...(toName !== undefined && { toName }),
      editedByUserId: user.id,
    },
  });

  return NextResponse.json({ draft: updated });
}
