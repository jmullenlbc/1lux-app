import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { knowledgeReach } from '@/lib/botKnowledge/retrieve';

export const runtime = 'nodejs';

// GET /api/automation/knowledge/reach — how much of the library the bot reads.
//
// Mike, 2026-09-08: "It sounds like it isnt right now." He was right, and the
// reason he had to ask is that the screen never said. Everything about what the
// bot can see lives in code — a category list, a limit, an excerpt length — so
// the only way to know was to read it. This puts the answer on the page: how
// many pieces go, how many characters that is against the ceiling, and how many
// documents are sitting there unreadable and therefore invisible to the bot.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  return NextResponse.json(await knowledgeReach());
}
