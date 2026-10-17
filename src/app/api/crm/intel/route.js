import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET, all INTEL items across notes, searchable + filterable.
// Query params: q (free text), contactId, company, status (default: not DISMISSED).
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q         = (sp.get('q') || '').trim();
  const contactId = sp.get('contactId') || undefined;
  const company   = (sp.get('company') || '').trim();
  const status    = sp.get('status') || undefined;

  const where = { kind: 'INTEL' };
  if (contactId) where.contactId = contactId;
  if (status)    where.status = status;
  else           where.status = { not: 'DISMISSED' };
  if (company)   where.company = { contains: company };
  if (q) {
    where.OR = [
      { rawText:     { contains: q } },
      { detail:      { contains: q } },
      { contactName: { contains: q } },
      { targetName:  { contains: q } },
      { company:     { contains: q } },
    ];
  }

  const items = await prisma.noteAction.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    include: { note: { select: { id: true, title: true, noteNumber: true, meetingDate: true } } },
    take: 500,
  });

  return NextResponse.json({ items });
}
