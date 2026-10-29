import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// People tags (migration 0141). Same rule as company tags: one row per tag,
// linked through ContactTagLink, so a rename or delete reaches every person.

// GET /api/contact-tags, every tag with how many people carry it.
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const tags = await prisma.contactTag.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { links: true } } },
  });
  return NextResponse.json({ tags });
}

// POST /api/contact-tags, create a tag. Names are unique, case-insensitively
// (checked here because sqlite has no `mode: 'insensitive'`).
export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;

  const { name } = await request.json();
  const clean = String(name ?? '').trim();
  if (!clean) return NextResponse.json({ error: 'Type a tag name first. Nothing was saved. (TAG_NAME_REQUIRED)' }, { status: 400 });

  const all = await prisma.contactTag.findMany({ select: { id: true, name: true } });
  const existing = all.find(t => t.name.toLowerCase() === clean.toLowerCase());
  if (existing) return NextResponse.json({ tag: existing });

  const tag = await prisma.contactTag.create({ data: { name: clean } });
  return NextResponse.json({ tag }, { status: 201 });
}
