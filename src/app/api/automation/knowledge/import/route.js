import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON array of knowledge entries' }, { status: 400 });
  }

  // Validate each entry
  const invalid = body.filter((item) => !item.category || !item.question || !item.answer);
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `${invalid.length} entries are missing required fields (category, question, answer)` },
      { status: 400 }
    );
  }

  const result = await prisma.botKnowledgeEntry.createMany({
    data: body.map((item) => ({
      category: item.category,
      keywords: item.keywords ?? null,
      question: item.question,
      answer: item.answer,
      isActive: true,
      source: 'FAQ_IMPORT',
      createdById: user.id,
    })),
  });

  return NextResponse.json({ ok: true, imported: result.count });
}
