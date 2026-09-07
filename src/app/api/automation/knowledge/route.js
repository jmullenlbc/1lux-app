import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  // The screen sends `q`; this route only ever read `search`, so the search box
  // did nothing. Read both.
  const search = searchParams.get('q') || searchParams.get('search');
  const activeParam = searchParams.get('active');

  const where = {};
  if (category) where.category = category;

  // Default active=true unless explicitly set to false
  where.isActive = activeParam === 'false' ? false : true;

  if (search) {
    where.OR = [
      { question: { contains: search } },
      { answer: { contains: search } },
      { keywords: { contains: search } },
    ];
  }

  const entries = await prisma.botKnowledgeEntry.findMany({
    where,
    orderBy: [{ category: 'asc' }, { question: 'asc' }],
  });

  return NextResponse.json({ entries });
}

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { category, keywords, question, answer, isActive } = body;

  if (!category || !question || !answer) {
    return NextResponse.json({ error: 'category, question, and answer are required' }, { status: 400 });
  }

  const entry = await prisma.botKnowledgeEntry.create({
    data: {
      category,
      keywords: keywords ?? null,
      question,
      answer,
      isActive: isActive ?? true,
      source: 'MANUAL',
      createdById: user.id,
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}
