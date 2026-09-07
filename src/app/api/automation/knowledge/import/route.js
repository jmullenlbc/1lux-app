import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();

  // The Import from CSV button has always sent `{ entries: [...] }` while this
  // route only accepted a bare array, so every import 400'd. Accept both — the
  // envelope is the shape the screen sends, and a bare array is what a script
  // posting straight at the API would send.
  const rows = Array.isArray(body) ? body : body?.entries;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No entries were sent to import.' }, { status: 400 });
  }

  // Validate each entry
  const invalid = rows.filter((item) => !item.category || !item.question || !item.answer);
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `${invalid.length} entries are missing required fields (category, question, answer)` },
      { status: 400 }
    );
  }

  const result = await prisma.botKnowledgeEntry.createMany({
    data: rows.map((item) => ({
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
