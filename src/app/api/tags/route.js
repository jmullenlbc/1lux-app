import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Client tags. One row per tag, linked to clients through ClientTagLink — so
// renaming a tag renames it on every client at once, and deleting one takes
// every link with it. That is Mike's rule: "Once you make a tag you should be
// able to edit or delete it and that happens to anything tagged with that."

// GET /api/tags — every tag with how many clients carry it.
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const tags = await prisma.clientTag.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { links: true } } },
  });

  return NextResponse.json({ tags });
}

// POST /api/tags — create a tag. Names are unique, case-insensitively.
export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;

  const { name } = await request.json();
  const clean = String(name ?? '').trim();
  if (!clean) return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });

  // Case-insensitive duplicate check done here rather than in the query:
  // Prisma's `mode: 'insensitive'` is Postgres-only and this app runs SQLite
  // locally, so a query-level check would work in prod and throw on the laptop.
  const all = await prisma.clientTag.findMany({ select: { id: true, name: true } });
  const existing = all.find(t => t.name.toLowerCase() === clean.toLowerCase());
  if (existing) return NextResponse.json({ tag: existing });

  const tag = await prisma.clientTag.create({ data: { name: clean } });
  return NextResponse.json({ tag }, { status: 201 });
}
