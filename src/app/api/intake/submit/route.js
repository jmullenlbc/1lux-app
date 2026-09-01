import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { classifyIntakeEmail, resolveClientByDomain } from '@/lib/intake';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { validateAnswers } from '@/lib/intake/questionnaire';
import { computeReviewFlags } from '@/lib/intake/reviewFlags';
import { notifyPrecon } from '@/lib/intake/notifyPrecon';

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

  const rawPayload = JSON.stringify({
    projectName,
    companyName: companyName || null,
    grossSf: grossSf ? Number(grossSf) : null,
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
      clientId,
      rawPayload,
      answers: answerRows.length ? { create: answerRows } : undefined,
    },
  });

  // Notify the precon inbox. A failed email must never fail the submission —
  // the row is already saved and the review queue is the source of truth.
  const flags = computeReviewFlags(drawingsData || null);
  try {
    await notifyPrecon({ submission, answers: answerRows, flags, drawings: drawingsData || null });
  } catch (e) {
    console.error('intake/submit notify failed (non-fatal):', e);
  }

  return NextResponse.json({ id: submission.id });
}
