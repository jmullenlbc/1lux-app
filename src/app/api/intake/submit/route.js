import { NextResponse } from 'next/server';
import { requirePublicBudgetAccess } from '@/lib/publicAccess';
import { prisma } from '@/lib/db';
import { classifyIntakeEmail, resolveClientByDomain } from '@/lib/intake';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { validateAnswers } from '@/lib/intake/questionnaire';
import { computeReviewFlags, figureReviewFlags } from '@/lib/intake/reviewFlags';
import { loadFigureNorms, loadAdoptedGuesses } from '@/lib/calibration/figureNormsLoad';
import { notifyPrecon } from '@/lib/intake/notifyPrecon';
import { checkLocation } from '@/lib/usStates';
import { findLikelyProject } from '@/lib/intake/duplicateMatch';
import { notifyUsers } from '@/lib/alerts';
import { inDepartment, SALES_MARKETING } from '@/lib/departments';
import { hashToken } from '@/lib/intake/draftTokens';
import { looseNumberOrNull } from '@/lib/numberInput';
import { drawingsFromSubmission } from '@/lib/intake/handoff';
import { automaticOwner, planFromWeb, makeConceptualProject, carryWebFigures, settleQuietly, linkPeopleQuietly } from '@/lib/intake/conceptualProjects';
import { askOnce, tellSalesAboutReviews } from '@/lib/intake/webPeople';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC, UNAUTHENTICATED submission endpoint for /conceptual_budget.
 *
 * Hardening pass 2026-08-08 (review of the 08-04 deploy):
 *  1. Work-email gating was CLIENT-ONLY — a direct POST bypassed the free-mail
 *     block entirely. `classifyIntakeEmail` is now enforced server-side; the
 *     browser check is just UX.
 *  2. No rate limit — anyone could script junk rows into the review queue.
 *     Same per-IP limiter as /api/intake/parse (which had one from day one).
 *  3. No size cap — `drawingsData` went into rawPayload unbounded; one hostile
 *     POST could store megabytes per row.
 *  4. BUG: `proposedName: companyName || projectName` put the COMPANY name in
 *     the project-name field whenever a company was entered. proposedName is
 *     now always the project name; company rides in rawPayload.
 *  5. `Client.emailDomains` existed for exactly this moment but wasn't used —
 *     an explicit domain match now auto-links clientId (high-confidence
 *     matches only; the reviewer can always change it).
 */

const LIMIT = { limit: 5, windowMs: 60_000 };
const MAX_PAYLOAD_CHARS = 200_000; // rawPayload ceiling (~200KB of JSON)

export async function POST(req) {
  const access = await requirePublicBudgetAccess();
  if (access.error) return access.error;
  const ip = clientIp(req);
  const gate = rateLimit(`intake-submit:${ip}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { contactName, contactEmail, companyName, projectName, buildingType, grossSf, drawingsData, answers } = body;

  if (!contactName || !contactEmail || !projectName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Server-side work-email enforcement — the client runs the same check for
  // instant feedback, but this is the boundary that counts.
  const emailCheck = classifyIntakeEmail(contactEmail);
  if (!emailCheck.ok) {
    return NextResponse.json({ error: emailCheck.message }, { status: 422 });
  }

  // Project location is required (Mike, 2026-09-12) — the same check the form
  // runs, enforced here because a direct POST skips the form.
  const loc = checkLocation({ city: body.city, state: body.state, zip: body.zip });
  if (!loc.ok) {
    return NextResponse.json({ error: `Please check the project location: ${loc.missing.join(', ')}.` }, { status: 422 });
  }

  const rawPayload = JSON.stringify({
    projectName,
    companyName: companyName || null,
    grossSf: looseNumberOrNull(grossSf),
    drawings: drawingsData || null,
    submittedAt: new Date().toISOString(),
  });
  if (rawPayload.length > MAX_PAYLOAD_CHARS) {
    return NextResponse.json({ error: 'Submission is too large.' }, { status: 413 });
  }

  // Auto-link the client on an explicit emailDomains match only. Website-based
  // matches stay a reviewer suggestion — never an automatic assignment.
  let clientId = null;
  try {
    const clients = await prisma.client.findMany({ select: { id: true, name: true, emailDomains: true, website: true } });
    const resolved = resolveClientByDomain(emailCheck.domain, clients.map(c => ({
      ...c,
      emailDomains: (() => { try { return JSON.parse(c.emailDomains || '[]'); } catch { return []; } })(),
    })));
    if (resolved.matchType === 'domain') clientId = resolved.clientId;
  } catch (e) {
    console.error('intake/submit client resolution failed (non-fatal):', e);
  }

  // Questionnaire answers are clamped to the known question set — unknown keys
  // and free text are dropped before anything touches the database.
  const answerRows = validateAnswers(answers);

  const submission = await prisma.conceptualSubmission.create({
    data: {
      submitterName:   String(contactName).slice(0, 200),
      submitterEmail:  emailCheck.domain ? contactEmail.toLowerCase().trim() : contactEmail,
      submitterDomain: emailCheck.domain,
      proposedName:    String(projectName).slice(0, 300),
      buildingType:    buildingType || null,
      city:            loc.city,
      state:           loc.state,
      zip:             loc.zip,
      clientId,
      rawPayload,
      answers: answerRows.length ? { create: answerRows } : undefined,
    },
  });

  // The unfinished draft this grew out of (migration 0087) is now finished:
  // link it so it drops off the staff "unfinished budgets" list and the two
  // rows stay tied together. Never fatal — the submission is already saved.
  let draftProjectId = null;
  let draftPeople = null;
  try {
    const tokenHash = hashToken(body.draftToken);
    if (tokenHash) {
      // An unfinished budget that was already turned into a project (0116):
      // the finished one lands on that same project, not a second one.
      const draft = await prisma.conceptualDraft.findUnique({ where: { tokenHash }, select: { id: true, projectId: true, clientId: true, contactId: true } });
      draftProjectId = draft?.projectId || null;
      draftPeople = draft;
      await prisma.conceptualDraft.updateMany({
        where: { tokenHash, submissionId: null },
        data: { submissionId: submission.id },
      });
    }
  } catch (e) {
    console.error('intake/submit draft link failed (non-fatal):', e);
  }

  // The company and person (0117): the ones the draft already found, or found
  // now. A look alike waits on My Desk as "Same person?". Never fatal.
  const people = { clientId: submission.clientId, contactId: null };
  try {
    if (draftPeople) {
      people.clientId = people.clientId || draftPeople.clientId;
      people.contactId = draftPeople.contactId;
      await prisma.duplicateReview.updateMany({ where: { draftId: draftPeople.id, submissionId: null }, data: { submissionId: submission.id } });
    } else {
      const words = String(contactName).trim().split(/\s+/);
      const owner = await automaticOwner(prisma);
      const found = await settleQuietly(prisma, {
        firstName: words.length > 1 ? words.slice(0, -1).join(' ') : words[0],
        lastName: words.length > 1 ? words[words.length - 1] : null,
        email: submission.submitterEmail, companyName: companyName || null, emailDomain: emailCheck.domain,
        projectName: submission.proposedName, submissionId: submission.id,
      }, { creatorId: owner?.id, clientId: submission.clientId });
      people.clientId = found.clientId; people.contactId = found.contactId;
    }
    if (people.clientId !== submission.clientId || people.contactId) {
      await prisma.conceptualSubmission.update({ where: { id: submission.id }, data: { clientId: people.clientId, contactId: people.contactId } });
      submission.clientId = people.clientId;
    }
  } catch (e) {
    console.error('intake/submit people failed (non-fatal):', e);
  }

  // Notify the precon inbox. A failed email must never fail the submission —
  // the row is already saved and the review queue is the source of truth.
  const flags = computeReviewFlags(drawingsData || null);
  // Reviewer-only: figures far off what our real jobs of this type run.
  try {
    flags.push(...figureReviewFlags(drawingsData || null, answerRows, await loadFigureNorms(), await loadAdoptedGuesses()));
  } catch (e) {
    console.error('intake/submit figure check failed (non-fatal):', e);
  }
  try {
    await notifyPrecon({ submission, answers: answerRows, flags, drawings: drawingsData || null });
  } catch (e) {
    console.error('intake/submit notify failed (non-fatal):', e);
  }

  // "Looks like [Project X]" — a guess for the reviewer, never shown to the
  // visitor and never acted on by itself. A failure here must not fail the
  // submission either.
  let looksLikeJob = false;
  try {
    const projects = await prisma.project.findMany({
      select: { id: true, name: true, city: true, state: true, clientId: true, contactEmail: true },
    });
    const match = draftProjectId ? null : findLikelyProject(submission, projects);
    if (match) {
      looksLikeJob = true;
      await prisma.conceptualSubmission.update({
        where: { id: submission.id },
        data: { suggestedProjectId: match.projectId, suggestedMatchReason: match.reason },
      });
      // "Same job?" on My Desk (0117), next to the review queue's own guess.
      const job = projects.find(p => p.id === match.projectId);
      const [first, ...rest] = String(contactName).trim().split(/\s+/);
      const asked = await askOnce(prisma, {
        kind: 'project', existingProjectId: match.projectId,
        reason: `Looks like ${job?.name || 'a job we already have'}: ${match.reason}.`,
        firstName: first || null, lastName: rest.join(' ') || null, email: submission.submitterEmail,
        companyName: companyName || null, emailDomain: emailCheck.domain, projectName: submission.proposedName,
        submissionId: submission.id,
      });
      await tellSalesAboutReviews(prisma, [asked], submission.submitterName);
    }
  } catch (e) {
    console.error('intake/submit duplicate check failed (non-fatal):', e);
  }

  // Every conceptual budget becomes a project (Mike, 2026-10-03), Conceptual
  // Budget service type, Qualified stage. Not when it looks like a job we
  // already have: staff decide that one in the review queue, as before. The
  // request stays in the queue (PENDING) so somebody still reviews it.
  let projectMade = null;
  if (!looksLikeJob) {
    try {
      const owner = await automaticOwner(prisma);
      const existing = draftProjectId
        ? await prisma.project.findUnique({ where: { id: draftProjectId }, select: { id: true, name: true, budgetNumber: true } })
        : null;
      if (owner || existing) {
        const plan = await planFromWeb({ answers: answerRows, drawings: drawingsFromSubmission(submission) });
        const project = existing || await makeConceptualProject(prisma, {
          ownerId: owner.id, plan,
          fields: {
            name: submission.proposedName, buildingType: submission.buildingType,
            city: submission.city, state: submission.state, zip: submission.zip,
            contactName: submission.submitterName, contactEmail: submission.submitterEmail,
            clientId: submission.clientId,
          },
        });
        const actor = owner || { id: null, name: 'Automatic (web budget)', email: null };
        const carried = await carryWebFigures(prisma, project, plan, {
          actor, source: 'web-request', submissionId: submission.id,
          note: existing ? 'The visitor came back and sent the web budget' : 'Carried over from the web budget request',
        });
        const line = existing
          ? `Sent after it was first saved as unfinished; landed on ${project.name} (${project.budgetNumber}).`
          : `Project ${project.name} (${project.budgetNumber}) made automatically.`
            + (carried === false ? ' The building figures did not carry over; please enter them on the project.' : '');
        await prisma.conceptualSubmission.update({
          where: { id: submission.id },
          data: { duplicateMatchId: project.id, reviewNote: line },
        });
        projectMade = project;
        await linkPeopleQuietly(prisma, project.id, people);
        projectMade.salesOwnerId = (await prisma.project.findUnique({ where: { id: project.id }, select: { salesOwnerId: true } }))?.salesOwnerId || null;
      }
    } catch (e) {
      console.error('intake/submit project create failed (non-fatal):', e);
    }
  }

  // Everyone in Sales + marketing hears about it in the app so somebody follows up.
  try {
    const sales = await prisma.user.findMany({
      where: { isActive: true, ...inDepartment(SALES_MARKETING) },
      select: { id: true },
    });
    const where = [submission.city, submission.state].filter(Boolean).join(', ');
    await notifyUsers(sales.map(u => u.id), {
      type:    'NEW_WEB_REQUEST',
      title:   `New web budget request: ${submission.proposedName}`,
      message: `${where ? where + ', ' : ''}from ${submission.submitterName} (${submission.submitterEmail})`
        + (projectMade ? `. Project ${projectMade.name} was made` + (projectMade.salesOwnerId ? '.' : ' and is in the pool on My Desk.') : ''),
      link:    `/admin/intake?id=${submission.id}`,
      dedupeKey: `intake:${submission.id}`,
    });
  } catch (e) {
    console.error('intake/submit sales alert failed (non-fatal):', e);
  }

  return NextResponse.json({ id: submission.id });
}
