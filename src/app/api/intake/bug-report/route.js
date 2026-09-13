import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { notifyUsers } from '@/lib/alerts';
import { cleanPublicBugReport } from '@/lib/publicBugReport';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC, UNAUTHENTICATED bug report from the "Report a bug" button on
 * /conceptual_budget (beta-test clients).
 *
 * The visitor has no account, so the row is written with reporterId null and
 * source 'PUBLIC'; whatever name/email they chose to type rides in
 * reporterName/reporterEmail. It lands on the same QC board as staff reports.
 *
 *  - Rate limited per IP (same speed-bump limiter as /api/intake/submit — see
 *    the limitation note in rateLimit.js).
 *  - Every field is clamped by cleanPublicBugReport before it is stored.
 *  - Admins are told in-app. A failed alert never fails the request: the row
 *    is already saved and the board is the source of truth.
 *  - The response is just { ok: true } — nothing from the row is echoed back.
 */

const LIMIT = { limit: 3, windowMs: 60_000 };

export async function POST(req) {
  const ip = clientIp(req);
  const gate = rateLimit(`intake-bug-report:${ip}`, LIMIT);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "You've sent a few reports in a row. Please wait a minute and try again." },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Something went wrong sending that. Please try again.' }, { status: 400 });
  }

  const clean = cleanPublicBugReport(body);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 422 });
  const d = clean.data;

  let report;
  try {
    report = await prisma.bugReport.create({
      data: {
        title:         d.title,
        description:   d.description,
        status:        'NEW',
        severity:      'MAJOR',
        module:        'Public Budget Form',
        pageUrl:       d.pageUrl,
        browserInfo:   d.browserInfo,
        viewport:      d.viewport,
        reporterId:    null,
        reporterName:  d.reporterName,
        reporterEmail: d.reporterEmail,
        source:        'PUBLIC',
      },
      select: { id: true, title: true },
    });
  } catch (e) {
    // Public route — log the detail, show the visitor a plain sentence.
    console.error('[api/intake/bug-report] create failed:', e?.name, e?.message);
    return NextResponse.json(
      { error: "We couldn't save your report just now. Please try again in a minute." },
      { status: 500 },
    );
  }

  // Tell every active super admin. notifyUsers swallows its own failures; the
  // try/catch covers the admin lookup.
  try {
    const admins = await prisma.user.findMany({
      where:  { role: { in: ['ILC_ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      select: { id: true },
    });
    const who = d.reporterName || d.reporterEmail || 'No name given';
    await notifyUsers(admins.map(a => a.id), {
      type:      'PUBLIC_BUG_REPORT',
      title:     'A beta client reported a bug',
      message:   `${who} — ${report.title}`.slice(0, 300),
      link:      `/admin/qc?focus=${report.id}`,
      dedupeKey: `public-bug:${report.id}`,
    });
  } catch (e) {
    console.error('[api/intake/bug-report] admin alert failed (non-fatal):', e?.message ?? e);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
