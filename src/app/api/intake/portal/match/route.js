import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { prisma } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { portalEmail, draftForCompany } from '@/lib/intake/portalServer';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC (behind the shared tool password). POST { email, draftId,
 * otherDraftId, same } answers "Is X the same project as Y?" (0132).
 * Only the person who made the newer budget may answer (Mike 10-16: "only
 * the person that just created the new budget"). One row per pair; an answer
 * can be changed, never asked again.
 */
const LIMIT = { limit: 30, windowMs: 60_000 };

export async function POST(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
  const gate = rateLimit(`intake-portal-match:${clientIp(req)}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } });
  }
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const who = portalEmail(body?.email);
  if (!who.ok) return NextResponse.json({ error: who.message }, { status: 422 });
  if (typeof body?.same !== 'boolean') return NextResponse.json({ error: 'Answer Yes or No.' }, { status: 422 });
  const [newer, older] = await Promise.all([
    draftForCompany(body?.draftId, who.domain),
    draftForCompany(body?.otherDraftId, who.domain),
  ]);
  if (!newer || !older || newer.id === older.id) return NextResponse.json({ error: 'That budget is no longer available.' }, { status: 404 });
  if (newer.email !== who.email) {
    return NextResponse.json({ error: 'Only the person who made the newer budget can answer this.' }, { status: 403 });
  }
  const row = await prisma.conceptualDraftMatch.upsert({
    where: { draftId_otherDraftId: { draftId: newer.id, otherDraftId: older.id } },
    create: { draftId: newer.id, otherDraftId: older.id, same: body.same, decidedByEmail: who.email },
    update: { same: body.same, decidedByEmail: who.email, decidedAt: new Date() },
    select: { id: true, same: true },
  });
  return NextResponse.json({ ok: true, same: row.same });
}
