import { NextResponse } from 'next/server';
import { requireAuth, isSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loadConferenceSeed } from '@/lib/conferences/seed';

export const dynamic = 'force-dynamic';

const refused = () => NextResponse.json({ error: 'Only a Super Admin can load the conference list.' }, { status: 403 });

// GET: how many are in the database now. POST: add what is missing from the
// research file. Never updates a row, so a second press changes nothing.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!isSuperAdmin(user.role)) return refused();
  const [events, plans, memberships] = await Promise.all([
    prisma.conferenceEdition.count({ where: { archivedAt: undefined } }),
    prisma.conferencePlan.count(),
    prisma.conferenceMembership.count(),
  ]);
  return NextResponse.json({ events, plans, memberships });
}

export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!isSuperAdmin(user.role)) return refused();
  try {
    const result = await loadConferenceSeed(prisma);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({
      error: `The load stopped on our server. Nothing from this press was saved, so it is safe to press again. If it stops again, send this to support. (${String(e?.code || e?.message || 'load failed').slice(0, 120)})`,
    }, { status: 500 });
  }
}
