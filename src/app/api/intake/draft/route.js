import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { prisma } from '@/lib/db';
import { classifyIntakeEmail } from '@/lib/intake';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { packDraft, unpackDraft, diffFields } from '@/lib/intake/drafts';
import { newToken, hashToken } from '@/lib/intake/draftTokens';
import { computeQuantities } from '@/lib/intake/quantities';
import { answersToEngine } from '@/lib/intake/questionnaire';
import { parseLooseNumber } from '@/lib/numberInput';
import { automaticOwner, settleQuietly } from '@/lib/intake/conceptualProjects';
import { saveChanges, createdChanges } from '@/lib/intake/draftHistory';
import { draftForEditor } from '@/lib/intake/portalServer';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC, UNAUTHENTICATED save / load of an unfinished conceptual budget.
 *
 * POST { token?, draftId?, editorEmail?, draft }  — save. Creates a
 *   ConceptualDraft the first time and returns its resume token; with a token,
 *   updates that row instead. Since 0132 a budget opened from the company
 *   portal (/conceptual_budget/my-budgets) carries no token: it sends its
 *   draftId and the editor's work email, and the row is theirs to edit when
 *   that email's domain is the budget's domain. The row is only ever the
 *   visitor's INPUTS (packDraft) — never a price, never the pricing model.
 *   Field rows are set or blanked, never deleted.
 *
 *   Every save that moves a value writes a ConceptualDraftSave row (who, when,
 *   which step) with one ConceptualDraftChange per value, so colleagues can
 *   see what changed (Mike 10-16). A colleague's save never overwrites the
 *   creator's name, email or company: those columns stay as they were.
 *
 * GET ?token=            — load the draft behind a resume link.
 * GET ?id=&as=           — load it for a colleague from the portal.
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

/** Creator columns a colleague's save leaves alone. */
const CREATOR_COLUMNS = ['firstName', 'lastName', 'email', 'emailDomain', 'company'];

export async function POST(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
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

  // ── Update the row behind a token, or the one a colleague opened ─────────
  let existing = null;
  let editor = packed.row.email;
  if (body?.token != null) {
    const tokenHash = hashToken(body.token);
    if (!tokenHash) return GONE();
    existing = await prisma.conceptualDraft.findUnique({ where: { tokenHash }, include: { fields: true } });
    if (!existing || existing.submissionId || existing.archivedAt) return GONE();
  } else if (body?.draftId != null) {
    existing = await draftForEditor(body.draftId, body.editorEmail);
    if (!existing) return GONE();
    editor = String(body.editorEmail).trim().toLowerCase();
  }

  if (existing) {
    const update = { ...data };
    if (editor !== existing.email) for (const k of CREATOR_COLUMNS) delete update[k];
    const writes = diffFields(existing.fields, packed.fields);
    const changes = saveChanges({ existingRow: existing, existingFields: existing.fields, row: update, writes, drawingsJson: packed.drawingsJson });
    await prisma.$transaction([
      prisma.conceptualDraft.update({
        where: { id: existing.id },
        data: { ...update, saveCount: { increment: 1 } },
      }),
      ...writes.map(f => prisma.conceptualDraftField.upsert({
        where: { draftId_kind_key: { draftId: existing.id, kind: f.kind, key: f.key } },
        create: { draftId: existing.id, kind: f.kind, key: f.key, value: f.value },
        update: { value: f.value },
      })),
      ...(changes.length ? [prisma.conceptualDraftSave.create({
        data: { draftId: existing.id, email: editor, stepId: packed.row.stepId, kind: 'save', savedAt: now, changes: { create: changes } },
      })] : []),
    ]);
    // A copy made in the portal (0132) has no person yet: the first save by
    // its maker, with a name typed, settles them like a first save would.
    if (!existing.contactId && editor === existing.email && packed.row.firstName) {
      const owner = await automaticOwner(prisma).catch(() => null);
      const who = await settleQuietly(prisma, {
        firstName: packed.row.firstName, lastName: packed.row.lastName, email: packed.row.email,
        companyName: packed.row.company, emailDomain: emailCheck.domain || packed.row.emailDomain,
        projectName: packed.row.projectName, draftId: existing.id,
      }, { creatorId: owner?.id, clientId: existing.clientId || null });
      if (who.clientId || who.contactId) {
        await prisma.conceptualDraft.update({ where: { id: existing.id }, data: { clientId: who.clientId, contactId: who.contactId } })
          .catch(e => console.error('[intake/draft] people not saved on the draft (non-fatal):', e?.message || e));
      }
    }
    return NextResponse.json({
      token: body.token ?? undefined, draftId: existing.id,
      savedAt: now.toISOString(), drawingsDropped: packed.drawingsDropped,
    });
  }

  // ── First save: a new row and a fresh token ──────────────────────────────
  const token = newToken();
  const draft = await prisma.conceptualDraft.create({
    data: {
      ...data,
      tokenHash: hashToken(token),
      fields: packed.fields.length ? { create: packed.fields } : undefined,
      saves: { create: { email: packed.row.email, stepId: packed.row.stepId, kind: 'created', savedAt: now,
        changes: { create: createdChanges({ row: data, fields: packed.fields, drawingsJson: packed.drawingsJson }) } } },
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
  return NextResponse.json({ token, draftId: draft.id, savedAt: now.toISOString(), drawingsDropped: packed.drawingsDropped });
}

export async function GET(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
  const ip = clientIp(req);
  const gate = rateLimit(`intake-draft-load:${ip}`, LOAD_LIMIT);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
  }
  const q = new URL(req.url).searchParams;

  // A colleague from the portal (0132): their own name goes on the saves, so
  // the wizard starts them on About You with the creator's name cleared and
  // their own email filled in. The creator's columns are never overwritten.
  if (q.get('id')) {
    const as = String(q.get('as') || '').trim().toLowerCase();
    const row = await draftForEditor(q.get('id'), as);
    if (!row) return GONE();
    const draft = unpackDraft(row, row.fields);
    if (as !== row.email) Object.assign(draft, { firstName: '', lastName: '', email: as, stepId: 'about' });
    return NextResponse.json({ draft, draftId: row.id, editorEmail: as });
  }

  const tokenHash = hashToken(q.get('token'));
  if (!tokenHash) return GONE();
  const row = await prisma.conceptualDraft.findUnique({ where: { tokenHash }, include: { fields: true } });
  if (!row || row.submissionId || row.archivedAt) return GONE();
  // Inputs only — the row holds nothing else, and unpackDraft builds the
  // wizard's own shape from it.
  return NextResponse.json({ draft: unpackDraft(row, row.fields), draftId: row.id });
}
