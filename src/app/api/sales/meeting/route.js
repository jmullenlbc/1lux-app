import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NEXT_ACTION_LABEL } from '@/lib/pipeline';
import { QUIET_AFTER_DAYS, normalizeLayout } from '@/lib/meeting/cards';

export const dynamic = 'force-dynamic';

const OPEN = 'OPEN';
const DAY  = 86400000;
const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : null;
const isOverdue = (d) => { if (!d) return false; const t = new Date(); t.setHours(0, 0, 0, 0); return new Date(d) < t; };
const daysAgo   = (n) => new Date(Date.now() - n * DAY);
const daysAhead = (n) => new Date(Date.now() + n * DAY);

// Cards that need no project scan at all — kept separate so we only pay for the
// queries a card that is actually switched on needs.
const PROJECT_CARDS = new Set([
  'awaitingSignature', 'nextActions', 'closingSoon',
  'budgetsAwaitingReply', 'wonAndLost', 'flagged',
]);

// GET /api/sales/meeting?cards=a,b,c — one payload per card on the screen.
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const requested = searchParams.get('cards');
  const cards = new Set(normalizeLayout(
    requested ? requested.split(',').map(s => s.trim()).filter(Boolean) : null,
  ));

  const needsProjects = [...PROJECT_CARDS].some(k => cards.has(k));

  const [projects, users] = await Promise.all([
    needsProjects ? prisma.project.findMany({
      where: { lifecycleStatus: { not: 'ARCHIVED' } },
      select: {
        id: true, name: true, serviceType: true, contractValue: true, designContractValue: true,
        procurementStatus: true, designStatus: true, procurementStage: true, designStage: true,
        procurementStatusReason: true, designStatusReason: true,
        proposalSentDate: true, budgetSentDate: true, expectedOrderDate: true,
        nextActionType: true, nextActionOwnerId: true, nextActionDueDate: true,
        flagged: true, flagNote: true, updatedAt: true,
        salesOwnerId: true,
        client: { select: { name: true } },
      },
    }).catch(() => []) : [],
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true } }).catch(() => []),
  ]);

  const nameOf = Object.fromEntries(users.map(u => [u.id, u.name || u.email]));

  const shape = (p) => ({
    id: p.id, name: p.name, client: p.client?.name || null, serviceType: p.serviceType,
    value: (p.contractValue || 0) + (p.designContractValue || 0),
    proposalSentDate: p.proposalSentDate, daysWaiting: daysSince(p.proposalSentDate),
    nextActionType: p.nextActionType, nextActionLabel: p.nextActionType ? (NEXT_ACTION_LABEL[p.nextActionType] || p.nextActionType) : null,
    nextActionOwnerId: p.nextActionOwnerId, nextActionOwnerName: p.nextActionOwnerId ? (nameOf[p.nextActionOwnerId] || null) : null,
    nextActionDueDate: p.nextActionDueDate, overdue: isOverdue(p.nextActionDueDate),
    salesOwnerId: p.salesOwnerId, salesOwnerName: p.salesOwnerId ? (nameOf[p.salesOwnerId] || null) : null,
  });

  const out = {};
  const want = (k) => cards.has(k);

  // ── ① Awaiting signature — a proposal is out and the deal hasn't closed ─────
  if (want('awaitingSignature')) {
    out.awaitingSignature = projects
      .filter(p => p.proposalSentDate
        && p.procurementStatus === OPEN && (p.designStatus === OPEN || !p.designStatus))
      .map(shape)
      .sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1)); // longest waiting first
  }

  // ── ② Next actions due — soonest and overdue first ─────────────────────────
  if (want('nextActions')) {
    out.nextActions = projects
      .filter(p => p.nextActionType)
      .map(shape)
      .sort((a, b) => {
        const da = a.nextActionDueDate ? new Date(a.nextActionDueDate).getTime() : Infinity;
        const db = b.nextActionDueDate ? new Date(b.nextActionDueDate).getTime() : Infinity;
        return da - db;
      });
  }

  // ── Closing in the next 2 weeks ────────────────────────────────────────────
  if (want('closingSoon')) {
    const horizon = daysAhead(14);
    out.closingSoon = projects
      .filter(p => p.expectedOrderDate
        && new Date(p.expectedOrderDate) <= horizon
        && p.procurementStatus === OPEN)
      .map(p => ({ ...shape(p), expectedOrderDate: p.expectedOrderDate }))
      .sort((a, b) => new Date(a.expectedOrderDate) - new Date(b.expectedOrderDate));
  }

  // ── Flagged deals ──────────────────────────────────────────────────────────
  if (want('flagged')) {
    out.flagged = projects
      .filter(p => p.flagged)
      .map(p => ({ ...shape(p), flagNote: p.flagNote || null }));
  }

  // ── Won and lost since last week ───────────────────────────────────────────
  // NOTE: there is no "status changed at" column, so this leans on updatedAt.
  // Any edit to a closed deal re-surfaces it. Honest approximation, not a lie —
  // a real statusChangedAt is worth adding when the new date fields go in.
  if (want('wonAndLost')) {
    const since = daysAgo(7);
    const closed = (s) => s && s !== OPEN;
    out.wonAndLost = projects
      .filter(p => new Date(p.updatedAt) >= since
        && (closed(p.procurementStatus) || closed(p.designStatus)))
      .map(p => ({
        ...shape(p),
        procurementStatus: p.procurementStatus,
        designStatus: p.designStatus,
        reason: p.procurementStatusReason || p.designStatusReason || null,
        changedAt: p.updatedAt,
      }))
      .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
  }

  // ── Budgets sent with no reply ─────────────────────────────────────────────
  // Mike's "IFC / for-award budgets awaiting response — not sure how to track
  // this that isn't manual". Nothing is typed: the budget's send date is already
  // recorded, and the email work already knows which messages count as a real
  // reply from a person (mass sends, calendar invites and auto-replies are out).
  // A budget with no inbound message since it went is a budget nobody answered.
  if (want('budgetsAwaitingReply')) {
    const sentBudgets = projects.filter(p => p.budgetSentDate && p.procurementStatus === OPEN);
    const ids = sentBudgets.map(p => p.id);

    // Newest genuine inbound contact per project, in one query.
    const replies = ids.length
      ? await prisma.emailMessage.findMany({
        where: { projectId: { in: ids }, countsAsContact: true },
        select: { projectId: true, sentAt: true },
        orderBy: { sentAt: 'desc' },
      }).catch(() => [])
      : [];
    const lastReply = new Map();
    for (const r of replies) if (!lastReply.has(r.projectId)) lastReply.set(r.projectId, r.sentAt);

    out.budgetsAwaitingReply = sentBudgets
      .filter(p => {
        const reply = lastReply.get(p.id);
        return !reply || new Date(reply) < new Date(p.budgetSentDate);
      })
      .map(p => ({
        ...shape(p),
        budgetSentDate: p.budgetSentDate,
        daysSinceSent: daysSince(p.budgetSentDate),
        lastReplyAt: lastReply.get(p.id) || null,
      }))
      .sort((a, b) => (b.daysSinceSent ?? -1) - (a.daysSinceSent ?? -1));
  }

  // ── Proposals sent last week ───────────────────────────────────────────────
  if (want('proposalsSentLastWeek')) {
    const rows = await prisma.proposal.findMany({
      where: { sentAt: { gte: daysAgo(7) } },
      select: {
        id: true, title: true, type: true, status: true, sentAt: true, calculatedFee: true,
        project: { select: { id: true, name: true, salesOwnerId: true, client: { select: { name: true } } } },
      },
      orderBy: { sentAt: 'desc' },
    }).catch(() => []);
    out.proposalsSentLastWeek = rows.map(r => ({
      id: r.id, projectId: r.project?.id || null,
      name: r.project?.name || r.title, client: r.project?.client?.name || null,
      title: r.title, type: r.type, status: r.status,
      sentAt: r.sentAt, value: r.calculatedFee || 0,
      salesOwnerName: r.project?.salesOwnerId ? (nameOf[r.project.salesOwnerId] || null) : null,
    }));
  }

  // ── Proposals awaiting a response ──────────────────────────────────────────
  if (want('proposalsAwaiting')) {
    const rows = await prisma.proposal.findMany({
      where: { status: 'SENT', sentAt: { not: null } },
      select: {
        id: true, title: true, type: true, sentAt: true, calculatedFee: true,
        project: { select: { id: true, name: true, salesOwnerId: true, client: { select: { name: true } } } },
      },
      orderBy: { sentAt: 'asc' },   // longest waiting first
    }).catch(() => []);
    out.proposalsAwaiting = rows.map(r => ({
      id: r.id, projectId: r.project?.id || null,
      name: r.project?.name || r.title, client: r.project?.client?.name || null,
      title: r.title, type: r.type, sentAt: r.sentAt,
      daysWaiting: daysSince(r.sentAt), value: r.calculatedFee || 0,
      salesOwnerName: r.project?.salesOwnerId ? (nameOf[r.project.salesOwnerId] || null) : null,
    }));
  }

  // ── Design submissions this week ───────────────────────────────────────────
  // Mike: drawings coming IN from the architect and packages going OUT are "the
  // same" to him, so both directions land on one card. The table already knows
  // which is which (source EXTERNAL | INTERNAL) — it just gets shown as a label.
  if (want('designSubmissions')) {
    const rows = await prisma.drawingSubmission.findMany({
      where: { createdAt: { gte: daysAgo(7) } },
      select: {
        id: true, phaseTag: true, source: true, notes: true, createdAt: true,
        uploadedBy: { select: { name: true, email: true } },
        project: { select: { id: true, name: true, salesOwnerId: true, client: { select: { name: true } } } },
        _count: { select: { files: true } },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => []);
    out.designSubmissions = rows.map(r => ({
      id: r.id, projectId: r.project?.id || null,
      name: r.project?.name || '—', client: r.project?.client?.name || null,
      phaseTag: r.phaseTag || null,
      direction: r.source === 'INTERNAL' ? 'Sent out' : 'Came in',
      fileCount: r._count?.files || 0,
      notes: r.notes || null, createdAt: r.createdAt,
      by: r.uploadedBy?.name || r.uploadedBy?.email || null,
      salesOwnerName: r.project?.salesOwnerId ? (nameOf[r.project.salesOwnerId] || null) : null,
    }));
  }

  // ── New website leads to review ────────────────────────────────────────────
  if (want('newLeads')) {
    const rows = await prisma.conceptualSubmission.findMany({
      where: { status: 'PENDING' },
      select: {
        id: true, submitterName: true, submitterEmail: true, proposedName: true,
        buildingType: true, createdAt: true, duplicateMatchId: true,
        client: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => []);
    out.newLeads = rows.map(r => ({
      id: r.id, name: r.proposedName, client: r.client?.name || null,
      from: r.submitterName, email: r.submitterEmail,
      buildingType: r.buildingType || null, createdAt: r.createdAt,
      daysWaiting: daysSince(r.createdAt),
      possibleDuplicate: !!r.duplicateMatchId,
    }));
  }

  // ── Gone quiet ─────────────────────────────────────────────────────────────
  // The cadence machinery already exists (RelationshipCadenceRule per tier, with
  // per-client and per-contact overrides and a snooze). All this card does is
  // read it, with the measured fallback for anyone who has no tier set.
  if (want('wentQuiet')) {
    const [rules, contacts] = await Promise.all([
      prisma.relationshipCadenceRule.findMany({ where: { isActive: true } }).catch(() => []),
      prisma.contact.findMany({
        where: { OR: [{ lastInPersonAt: { not: null } }, { lastTouchpointAt: { not: null } }] },
        select: {
          id: true, name: true, company: true, title: true, cadenceTier: true, cadenceDays: true,
          lastInPersonAt: true, lastTouchpointAt: true, nextCheckInAt: true,
          client: { select: { name: true, cadenceDays: true } },
        },
      }).catch(() => []),
    ]);
    const daysByTier = Object.fromEntries(rules.map(r => [r.tier, r.cadenceDays]));
    const today = new Date(); today.setHours(0, 0, 0, 0);

    out.wentQuiet = contacts
      .map(c => {
        const limit = c.cadenceDays
          ?? c.client?.cadenceDays
          ?? (c.cadenceTier ? daysByTier[c.cadenceTier] : null)
          ?? QUIET_AFTER_DAYS;
        const ref = c.lastInPersonAt ?? c.lastTouchpointAt;
        if (!ref) return null;
        // A snooze in the future means somebody already dealt with this one.
        if (c.nextCheckInAt && new Date(c.nextCheckInAt) >= today) return null;
        const silentFor = daysSince(ref);
        return silentFor > limit
          ? {
            id: c.id, name: c.name, company: c.company || c.client?.name || null,
            title: c.title || null, tier: c.cadenceTier || null,
            silentFor, limit, lastAt: ref,
          }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.silentFor - a.silentFor);
  }

  return NextResponse.json({
    ...out,
    salesUsers: users.map(u => ({ id: u.id, name: u.name || u.email })),
    counts: {
      ...Object.fromEntries(
        Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
      ),
      overdue: (out.nextActions || []).filter(a => a.overdue).length,
    },
  });
}
