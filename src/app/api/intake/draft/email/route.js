import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { hashToken } from '@/lib/intake/draftTokens';
import { sendEmail, escapeHtml } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/**
 * "Email me the link" for an unfinished conceptual budget — the seam the
 * hidden resume-link button on the review page calls (RESUME_LINK_ENABLED in
 * IntakeClient.jsx). Built now so the wiring exists; it goes live when
 * Microsoft email is hooked up in src/lib/notify.js sendEmail(). Until then
 * sendEmail dry-runs (logs, sends nothing) and this still answers ok.
 *
 * The link is only ever sent to the address ON the draft, and only the holder
 * of the token can ask, so this cannot be used to mail a stranger.
 */

const LIMIT = { limit: 5, windowMs: 60_000 };

export async function POST(req) {
  const ip = clientIp(req);
  const gate = rateLimit(`intake-draft-email:${ip}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const tokenHash = hashToken(body?.token);
  if (!tokenHash) return NextResponse.json({ error: 'That saved budget is no longer available.' }, { status: 404 });

  const row = await prisma.conceptualDraft.findUnique({ where: { tokenHash } });
  if (!row || row.submissionId || row.archivedAt) {
    return NextResponse.json({ error: 'That saved budget is no longer available.' }, { status: 404 });
  }

  const origin = process.env.APP_ORIGIN || new URL(req.url).origin;
  const link = `${origin}/conceptual_budget?resume=${encodeURIComponent(body.token)}`;
  const project = escapeHtml(row.projectName);
  const html = `
    <p>Hi ${escapeHtml(row.firstName)},</p>
    <p>Here is the link to pick up your lighting budget for <strong>${project}</strong> where you left off:</p>
    <p><a href="${link}">${link}</a></p>
    <p>Anyone with this link can open your budget, so keep it to yourself.</p>
    <p>— ILC Studios</p>`;

  try {
    await sendEmail({ to: row.email, subject: `Your ILC Studios budget for ${row.projectName}`, html });
    await prisma.conceptualDraft.update({ where: { id: row.id }, data: { linkEmailedAt: new Date() } });
  } catch (e) {
    console.error('intake/draft/email failed:', e);
    return NextResponse.json({ error: 'We could not send the email just now. Copy the link instead.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
