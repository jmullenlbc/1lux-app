import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { notifyUsers } from '@/lib/alerts';
import { cleanPublicBugReport } from '@/lib/publicBugReport';
import { putQcObject } from '@/lib/qcStorage';

export const dynamic = 'force-dynamic';

// Over this the screenshot is ignored (Amplify 413s near 4.4 MB anyway).
const MAX_SHOT_BYTES = 4_000_000;

/**
 * PUBLIC, UNAUTHENTICATED bug report from the "Report a bug" button on
 * /conceptual_budget (beta-test clients).
 *
 * The visitor has no account, so the row is written with reporterId null and
 * source 'PUBLIC'; whatever name/email they chose to type rides in
 * reporterName/reporterEmail. It lands on the same QC board as staff reports.
 *
 *  - Rate limited per IP (same speed-bump limiter as /api/intake/submit, see
 *    the limitation note in rateLimit.js).
 *  - Every field is clamped by cleanPublicBugReport before it is stored.
 *  - Admins are told in-app. A failed alert never fails the request: the row
 *    is already saved and the board is the source of truth.
 *  - The response is just { ok: true }, nothing from the row is echoed back.
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

  // Mike 10-15: the button now sends multipart (a `meta` JSON part plus an
  // optional screenshot), the same shape as the staff QC report. Plain JSON
  // still works for anything older.
  let body;
  let screenshot = null;
  try {
    const ctype = req.headers.get('content-type') || '';
    if (ctype.includes('multipart/form-data')) {
      const fd = await req.formData();
      body = JSON.parse(fd.get('meta') || '{}');
      const s = fd.get('screenshot');
      if (s && typeof s === 'object' && s.size > 0 && s.size <= MAX_SHOT_BYTES) screenshot = s;
    } else {
      body = await req.json();
    }
  } catch {
    return NextResponse.json({ error: 'Something went wrong sending that. Please try again.' }, { status: 400 });
  }

  const clean = cleanPublicBugReport(body);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 422 });
  const d = clean.data;

  // A screenshot that will not store never fails the report: the words are
  // what matter and the row is the source of truth.
  let screenshotKey = null;
  if (screenshot) {
    try {
      const isJpeg = (screenshot.type || '').includes('jpeg');
      screenshotKey = await putQcObject(Buffer.from(await screenshot.arrayBuffer()), isJpeg ? { ext: 'jpg', contentType: 'image/jpeg' } : { ext: 'png' });
    } catch (e) {
      console.error('[api/intake/bug-report] screenshot store failed (non-fatal):', e?.name, e?.message);
    }
  }

  // The wizard sends its draft id: the report links to that budget (and to
  // its project once it has one). A stale or unknown id just links nothing.
  let draft = null;
  if (d.draftId) {
    try {
      draft = await prisma.conceptualDraft.findUnique({ where: { id: d.draftId }, select: { id: true, email: true, projectId: true } });
    } catch (e) {
      console.error('[api/intake/bug-report] draft lookup failed (non-fatal):', e?.message);
    }
  }
  const pageState = (draft || d.step || d.projectName) ? JSON.stringify({
    budgetName: d.projectName || undefined,
    step:       d.step || undefined,
    draftId:    draft?.id,
    // Opens the budget the way the client sees it (company portal link, 0132).
    budgetLink: draft ? `/conceptual_budget?open=${draft.id}&as=${encodeURIComponent(draft.email)}` : undefined,
  }) : null;

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
        screenshotKey,
        projectId:     draft?.projectId || null,
        pageStateJson: pageState,
        reporterId:    null,
        reporterName:  d.reporterName,
        reporterEmail: d.reporterEmail,
        source:        'PUBLIC',
      },
      select: { id: true, title: true },
    });
  } catch (e) {
    // Public route, log the detail, show the visitor a plain sentence.
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
      message:   `${who}: ${report.title}`.slice(0, 300),
      link:      `/admin/tasks?tab=bugs&focus=${report.id}`,
      dedupeKey: `public-bug:${report.id}`,
    });
  } catch (e) {
    console.error('[api/intake/bug-report] admin alert failed (non-fatal):', e?.message ?? e);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
