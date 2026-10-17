import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { prisma } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { portalEmail, draftForCompany } from '@/lib/intake/portalServer';
import { labelFor } from '@/lib/intake/draftHistory';
import { STEP_LABELS } from '@/lib/intake/drafts';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC (behind the shared tool password). POST { email, draftId } answers
 * the history of one of the company's budgets (0132, Mike 10-16: "some kind
 * of history for duplicated budgets so they can see what has changed"):
 * every save that moved a value, newest first, who made it, on which step,
 * and each value before and after in plain words. Inputs only, never a price.
 */
const LIMIT = { limit: 30, windowMs: 60_000 };
const MAX_SAVES = 200;

export async function POST(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
  const gate = rateLimit(`intake-portal-history:${clientIp(req)}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } });
  }
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const who = portalEmail(body?.email);
  if (!who.ok) return NextResponse.json({ error: who.message }, { status: 422 });
  const row = await draftForCompany(body?.draftId, who.domain);
  if (!row) return NextResponse.json({ error: 'That budget is no longer available.' }, { status: 404 });

  const saves = await prisma.conceptualDraftSave.findMany({
    where: { draftId: row.id },
    orderBy: { savedAt: 'desc' },
    take: MAX_SAVES,
    include: { changes: { orderBy: { id: 'asc' } } },
  });
  const copiedFrom = row.copiedFromId
    ? await prisma.conceptualDraft.findUnique({ where: { id: row.copiedFromId }, select: { id: true, projectName: true, email: true } })
    : null;
  return NextResponse.json({
    draftId: row.id,
    projectName: row.projectName,
    createdBy: row.email,
    createdAt: row.createdAt,
    copiedFrom,
    saves: saves.map(s => ({
      id: s.id,
      email: s.email,
      savedAt: s.savedAt,
      kind: s.kind,
      step: s.stepId ? (STEP_LABELS[s.stepId] || s.stepId) : null,
      changes: s.changes.map(c => ({
        kind: c.kind, key: c.key, label: labelFor(c.kind, c.key), before: c.before, after: c.after,
      })),
    })),
  });
}
