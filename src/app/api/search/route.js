import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/search?q=  The phone Search tab: people, companies and projects in
// one box. Staff only. Archived rows are hidden by the db.js filter.
// Case-insensitive match is Postgres-only in Prisma; SQLite's LIKE already is.
const ci = String(process.env.DATABASE_URL || '').startsWith('postgres') ? { mode: 'insensitive' } : {};

export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ people: [], companies: [], projects: [] });
  const has = { contains: q, ...ci };

  const [people, companies, projects] = await Promise.all([
    prisma.contact.findMany({
      where: { OR: [{ name: has }, { email: has }, { title: has }] },
      select: { id: true, name: true, title: true, email: true, phone: true, client: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' }, take: 15,
    }),
    prisma.client.findMany({
      where: { name: has }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 10,
    }),
    prisma.project.findMany({
      where: { name: has }, select: { id: true, name: true, status: true, client: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' }, take: 10,
    }),
  ]);
  return NextResponse.json({ people, companies, projects });
}
