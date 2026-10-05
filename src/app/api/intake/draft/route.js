import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { classifyIntakeEmail } from '@/lib/intake';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { packDraft, unpackDraft, diffFields } from '@/lib/intake/drafts';
import { newToken, hashToken } from '@/lib/intake/draftTokens';
import { computeQuantities } from '@/lib/intake/quantities';
import { answersToEngine } from '@/lib/intake/questionnaire';
import { parseLooseNumber } from '@/lib/numberInput';
import { automaticOwner, settleQuietly } from '@/lib/intake/conceptualProjects';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC, UNAUTHENTICATED save / load of an unfinished conceptual budget.
 *
 * POST { token?, draft }  — save. Creates a ConceptualDraft the first time and
 *   returns its resume token; with a token, updates that row instead. The row
 *   is only ever the visitor's INPUTS (packDraft) — never a price, never the
 *   pricing model. Field rows are set or blanked, never deleted.
 * GET ?token=            — load the draft behind a resume link, in the same
 *   shape the wizard keeps in the browser.
 *
 * A token that is unknown, already submitted, or put away by staff answers
 * 404 so the wizard drops it and starts a fresh row on the next change.
 * Same per-IP limiter family as the other public intake routes.
 */

const SAVE_LIMIT = { limit: 30, windowMs: 60_000 }; // debounced client-side, ~one per few seconds while typing
const LOAD_LIMIT = { limit: 20, windowMs: 60_000 };
const MAX_BODY_CHARS = 220_000; // drawings ceiling (200k) plus the rest

const GONE = () => NextResponse.json({ error: 'That saved budget is no longer available.' }, { status: 404 });

/** The lead columns staff scan the list by — from the same takeoff the estimate uses. */
function leadColumns(packed) {
  try {
    const answers = {};
    for (const f of packed.fields) {
      if (f.kind === 'answer' || f.kind === 'figure') answers[f.key] = f.value;
      else if (f.kind === 'correction') answers[`correct${f.key.charAt(0).toUpperCase()}${f.key.slice(1)}`] = f.value;
    }
    if (packed.row.haveDrawings === 'no') answers.noDrawings = 'yes';
    if (packed.row.hasClubhouse) answers.hasClubhouse = packed.row.hasClubhouse;
    const drawings = packed.drawingsJson ? JSON.parse(packed.drawingsJson) : null;
    const rows = computeQuantities(drawings, answers, null);
    const pick = key => {
      const r = rows.find(x => x.key === key);
      const n = parseLooseNumber(r?.value);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };
    return {
      buildingType: answersToEngine(answers).buildingTypeKey ?? null,
      unitCount: pick('totalUnits'),
      grossSf: pick('grossSf'),
    };
  } catch (e) {
    console.error('intake/draft lead columns failed (non-fatal):', e);
    return { buildingType: null, unitCount: null, grossSf: null };
  }
}

export async function POST(req) {
  const ip = clientIp(req);
  const gate = rateLimit(`intake-draft-save:${ip}`, SAVE_LIMIT);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Too many saves. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (JSON.stringify(body).length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: 'Saved budget is too large.' }, { status: 413 });
  }

  const packed = packDraft(body?.draft);
  if (!packed.ok) return NextResponse.json({ error: packed.error }, { status: 422 });

  // Same work-email rule as submit, enforced here because a direct POST skips the form.
  const emailCheck = classifyIntakeEmail(packed.row.email);
  if (!emailCheck.ok) return NextResponse.json({ error: emailCheck.message }, { status: 422 });

  const lead = leadColumns(packed);
  const now = new Date();
  const data = { ...packed.row, ...lead, drawingsJson: packed.drawingsJson, lastSavedAt: now };

  // ── Update the row behind a token ────────────────────────────────────────
  if (body?.token != null) {
    const tokenHash = hashToken(body.token);
    if (!tokenHash) return GONE();
    const existing = await prisma.conceptualDraft.findUnique({
      where: { tokenHash },
      include: { fields: true },
    });
    if (!existing || existing.submissionId || existing.archivedAt) return GONE();

    const writes = diffFields(existing.fields, packed.fields);
    await prisma.$transaction([
      prisma.conceptualDraft.update({
        where: { id: existing.id },
        data: { ...data, saveCount: { increment: 1 } },
      }),
      ...writes.map(f => prisma.conceptualDraftField.upsert({
        where: { draftId_kind_key: { draftId: existing.id, kind: f.kind, key: f.key } },
        create: { draftId: existing.id, kind: f.kind, key: f.key, value: f.value },
        update: { value: f.value },
      })),
    ]);
    return NextResponse.json({ token: body.token, savedAt: now.toISOString(), drawingsDropped: packed.drawingsDropped });
  }

  // ── First save: a new row and a fresh token ──────────────────────────────
  const token = newToken();
  const draft = await prisma.conceptualDraft.create({
    data: {
      ...data,
      tokenHash: hashToken(token),
      fields: packed.fields.length ? { create: packed.fields } : undefined,
    },
    select: { id: true },
  });
  // The company and person become CRM records the moment a budget is started
  // (Mike, 10-4). A look alike waits on My Desk instead. Never blocks the save.
  const owner = await automaticOwner(prisma).catch(() => null);
  const who = await settleQuietly(prisma, {
    firstName: packed.row.firstName, lastName: packed.row.lastName, email: packed.row.email,
    companyName: packed.row.company, emailDomain: emailCheck.domain || packed.row.emailDomain,
    projectName: packed.row.projectName, draftId: draft.id,
  }, { creatorId: owner?.id });
  if (who.clientId || who.contactId) {
    await prisma.conceptualDraft.update({ where: { id: draft.id }, data: { clientId: who.clientId, contactId: who.contactId } })
      .catch(e => console.error('[intake/draft] people not saved on the draft (non-fatal):', e?.message || e));
  }
  return NextResponse.json({ token, savedAt: now.toISOString(), drawingsDropped: packed.drawingsDropped });
}

export async function GET(req) {
  const ip = clientIp(req);
  const gate = rateLimit(`intake-draft-load:${ip}`, LOAD_LIMIT);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
  }
  const tokenHash = hashToken(new URL(req.url).searchParams.get('token'));
  if (!tokenHash) return GONE();
  const row = await prisma.conceptualDraft.findUnique({ where: { tokenHash }, include: { fields: true } });
  if (!row || row.submissionId || row.archivedAt) return GONE();
  // Inputs only — the row holds nothing else, and unpackDraft builds the
  // wizard's own shape from it.
  return NextResponse.json({ draft: unpackDraft(row, row.fields) });
}
