import { NextResponse } from 'next/server';
import { requireIntakeReviewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Staff "Put away" / "Bring back" for an unfinished public budget on the
 * intake queue. Archive-only: stamps archivedAt and who did it; the row, its
 * field rows and the drawing read all stay (Mike: archive only, everywhere).
 *
 * PATCH { archived: true | false }
 */
export async function PATCH(request, { params }) {
  const { user, error } = await requireIntakeReviewer(request);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (typeof body?.archived !== 'boolean') {
    return NextResponse.json({ error: 'Send { archived: true | false }.' }, { status: 400 });
  }

  const draft = await prisma.conceptualDraft.findUnique({ where: { id: params.id } });
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.conceptualDraft.update({
    where: { id: draft.id },
    data: body.archived
      ? { archivedAt: new Date(), archivedById: user.id }
      : { archivedAt: null, archivedById: null },
    select: { id: true, archivedAt: true, archivedById: true },
  });
  return NextResponse.json({ draft: updated });
}
