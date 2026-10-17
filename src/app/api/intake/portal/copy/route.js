import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { prisma } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { newToken, hashToken } from '@/lib/intake/draftTokens';
import { portalEmail, draftForCompany } from '@/lib/intake/portalServer';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC (behind the shared tool password). POST { email, draftId } makes a
 * full copy of one of the company's budgets (0132, Mike 10-16: "Full copy").
 *
 *   - every answer, figure, correction and the drawings read come along;
 *   - same project name (so it groups with the original, no "same project?"
 *     question), budget description "Copy of <original>";
 *   - the copy is a fresh unfinished budget: never sent, never a project,
 *     with its own resume token (never returned) and copiedFromId pointing
 *     back;
 *   - the copier is its creator. When that is not the original creator the
 *     name is left blank so the wizard starts them on About You;
 *   - the first history row says "copied", so the trail shows where it came from.
 *
 * Answers { draftId } of the copy; the portal opens it.
 */
const LIMIT = { limit: 10, windowMs: 60_000 };

export async function POST(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
  const gate = rateLimit(`intake-portal-copy:${clientIp(req)}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json({ error: 'Too many copies. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } });
  }
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const who = portalEmail(body?.email);
  if (!who.ok) return NextResponse.json({ error: who.message }, { status: 422 });
  const source = await draftForCompany(body?.draftId, who.domain);
  if (!source) return NextResponse.json({ error: 'That budget is no longer available.' }, { status: 404 });

  const sameCreator = source.email === who.email;
  const now = new Date();
  const copy = await prisma.conceptualDraft.create({
    data: {
      tokenHash: hashToken(newToken()),
      firstName: sameCreator ? source.firstName : '',
      lastName:  sameCreator ? source.lastName : '',
      email: who.email,
      emailDomain: who.domain,
      company: source.company,
      projectName: source.projectName,
      budgetName: `Copy of ${source.budgetName || 'budget'}`.slice(0, 200),
      city: source.city, state: source.state, zip: source.zip,
      haveDrawings: source.haveDrawings,
      stepId: 'about',
      completedSteps: '',
      hasClubhouse: source.hasClubhouse,
      buildingType: source.buildingType,
      unitCount: source.unitCount,
      grossSf: source.grossSf,
      drawingsJson: source.drawingsJson,
      saveCount: 1,
      lastSavedAt: now,
      copiedFromId: source.id,
      clientId: source.clientId,
      fields: source.fields.length
        ? { create: source.fields.map(f => ({ kind: f.kind, key: f.key, value: f.value })) }
        : undefined,
      saves: { create: { email: who.email, stepId: 'about', kind: 'copied', savedAt: now, changes: { create: [
        { kind: 'row', key: 'copiedFrom', before: '', after: `${source.projectName} (made by ${source.email})` },
        { kind: 'row', key: 'budgetName', before: source.budgetName || '', after: `Copy of ${source.budgetName || 'budget'}` },
      ] } } },
    },
    select: { id: true },
  });

  // The copier becomes a person on the company's CRM record the first time
  // they save with their name typed (see the draft route), not here with a
  // blank name. The same creator keeps their contact row.
  if (sameCreator && source.contactId) {
    await prisma.conceptualDraft.update({ where: { id: copy.id }, data: { contactId: source.contactId } }).catch(() => null);
  }

  return NextResponse.json({ draftId: copy.id });
}
