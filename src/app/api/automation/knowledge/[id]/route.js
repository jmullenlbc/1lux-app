import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = params;

  const existing = await prisma.botKnowledgeEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Knowledge entry not found' }, { status: 404 });
  }

  const body = await req.json();
  const { category, keywords, question, answer, isActive } = body;

  const updated = await prisma.botKnowledgeEntry.update({
    where: { id },
    data: {
      ...(category !== undefined && { category }),
      ...(keywords !== undefined && { keywords }),
      ...(question !== undefined && { question }),
      ...(answer !== undefined && { answer }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json({ entry: updated });
}

/**
 * Nothing in the bot's library is ever thrown away.
 *
 * Mike, 2026-09-10: "I think we should make all knowledge base probably be
 * archived and not be deleted at all if it takes it out of the bot's reach."
 *
 * Archiving already does the whole job — it takes the answer out of the bot's
 * reach completely (retrieve.js filters on isActive) while keeping every word of
 * it, and one click puts it back. Deleting only added the chance of losing
 * something for good with no way to get it back.
 *
 * The route is kept and refuses on purpose rather than being removed, so that an
 * old browser tab, a bookmarked call, or anything written later cannot quietly
 * destroy a row by hitting a URL the screen no longer uses.
 */
export async function DELETE() {
  const { error } = await requireAuth();
  if (error) return error;

  return NextResponse.json({
    error: 'Answers in the bot library are archived, never deleted. Archive it instead — that takes it out of the bot and keeps it.',
  }, { status: 405 });
}

