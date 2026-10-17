import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOutreachGroups, draftContactOutreach } from '@/lib/bot/composeOutreach';

export const dynamic = 'force-dynamic';

// GET, pending outreach groups for this note (confirmed asks per contact).
export async function GET(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const groups = await getOutreachGroups(params.id);
  return NextResponse.json({
    groups: groups.map(g => ({
      contactId: g.contactId, contactName: g.contactName, email: g.email,
      count: g.actions.length, items: g.actions.map(a => ({ id: a.id, label: a.label, detail: a.detail })),
    })),
  });
}

// POST, compose ONE email for a contact's group and queue it. Body: { contactId }
export async function POST(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const { contactId } = await request.json();
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

  const note = await prisma.note.findUnique({ where: { id: params.id }, select: { createdById: true } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let reviewWindowMinutes = 30;
  try {
    const cfg = await prisma.botConfig.findFirst();
    if (cfg?.reviewWindowMinutes != null && cfg.reviewWindowMinutes > 0) reviewWindowMinutes = cfg.reviewWindowMinutes;
  } catch {}

  const result = await draftContactOutreach(params.id, contactId, note.createdById, reviewWindowMinutes);
  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}
