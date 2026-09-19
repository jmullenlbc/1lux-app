import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { hashToken } from '@/lib/intake/draftTokens';
import {
  isBot, deviceKind, visitorKey, referrerHost, cleanTag, furthestStep,
} from '@/lib/intake/visits';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC, UNAUTHENTICATED visit ping for /conceptual_budget (migration 0090).
 *
 * POST { visitId?, stepId, referrer?, utm?: {source, medium, campaign},
 *        draftToken?, submissionId? }  →  { visitId }
 *
 * The first ping (no visitId) opens a ConceptualVisit row; later pings move the
 * same row forward — furthest step, last seen, and the draft / request the
 * visit turned into. The page keeps the visitId for the life of the tab.
 *
 * What is NOT stored: the IP address, the browser string, the full referring
 * address, anything typed into the form. See src/lib/intake/visits.js.
 *
 * Tracking must never be the reason the page misbehaves: every failure answers
 * 204 and the page ignores the reply either way. Crawlers get a 204 and no row.
 */

const LIMIT = { limit: 40, windowMs: 60_000 };
const MAX_BODY_CHARS = 4_000;
const SUBMISSION_LINK_WINDOW_MS = 15 * 60 * 1000;
const ID_RE = /^c[a-z0-9]{20,30}$/;

const nothing = () => new NextResponse(null, { status: 204 });

export async function POST(req) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`intake-visit:${ip}`, LIMIT).allowed) return nothing();

    const ua = req.headers.get('user-agent') || '';
    if (isBot(ua)) return nothing();

    const text = await req.text();
    if (!text || text.length > MAX_BODY_CHARS) return nothing();
    let body;
    try { body = JSON.parse(text); } catch { return nothing(); }
    if (!body || typeof body !== 'object') return nothing();

    // The draft / request this visit turned into, when the page knows one.
    let draftId = null;
    let submissionId = null;
    const tokenHash = body.draftToken ? hashToken(body.draftToken) : null;
    if (tokenHash) {
      const draft = await prisma.conceptualDraft.findUnique({
        where: { tokenHash }, select: { id: true, submissionId: true },
      });
      if (draft) { draftId = draft.id; submissionId = draft.submissionId ?? null; }
    }
    if (!submissionId && typeof body.submissionId === 'string' && ID_RE.test(body.submissionId)) {
      // Only a request made in the last few minutes — a visit cannot attach
      // itself to somebody else's old submission.
      const sub = await prisma.conceptualSubmission.findUnique({
        where: { id: body.submissionId }, select: { id: true, createdAt: true },
      });
      if (sub && Date.now() - new Date(sub.createdAt).getTime() < SUBMISSION_LINK_WINDOW_MS) submissionId = sub.id;
    }

    const now = new Date();
    const existing = typeof body.visitId === 'string' && ID_RE.test(body.visitId)
      ? await prisma.conceptualVisit.findUnique({ where: { id: body.visitId } })
      : null;

    if (existing && !existing.archivedAt) {
      const step = furthestStep(existing.stepReached, body.stepId);
      await prisma.conceptualVisit.update({
        where: { id: existing.id },
        data: {
          ...step,
          lastSeenAt: now,
          pings: { increment: 1 },
          ...(draftId && !existing.draftId ? { draftId } : {}),
          ...(submissionId && !existing.submissionId ? { submissionId } : {}),
        },
      });
      return NextResponse.json({ visitId: existing.id });
    }

    const step = furthestStep(null, body.stepId);
    const row = await prisma.conceptualVisit.create({
      data: {
        visitorKey: visitorKey(ip, ua, process.env.VISIT_SALT || process.env.JWT_SECRET || 'ilc-visits'),
        referrerHost: referrerHost(body.referrer, req.headers.get('host') || ''),
        utmSource: cleanTag(body.utm?.source),
        utmMedium: cleanTag(body.utm?.medium),
        utmCampaign: cleanTag(body.utm?.campaign),
        deviceKind: deviceKind(ua),
        ...step,
        visitedAt: now,
        lastSeenAt: now,
        draftId,
        submissionId,
      },
      select: { id: true },
    });
    return NextResponse.json({ visitId: row.id });
  } catch (e) {
    console.error('[intake/visit] (non-fatal):', e?.message || e);
    return nothing();
  }
}
