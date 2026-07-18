import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NEXT_ACTION_LABEL } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

const OPEN = 'OPEN';
const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;
const isOverdue = (d) => { if (!d) return false; const t = new Date(); t.setHours(0, 0, 0, 0); return new Date(d) < t; };

// GET /api/sales/meeting — the two v1 weekly-meeting queues, computed server-side.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const [projects, users] = await Promise.all([
    prisma.project.findMany({
      where: { lifecycleStatus: { not: 'ARCHIVED' } },
      select: {
        id: true, name: true, serviceType: true, contractValue: true, designContractValue: true,
        procurementStatus: true, designStatus: true, procurementStage: true, designStage: true,
        proposalSentDate: true, nextActionType: true, nextActionOwnerId: true, nextActionDueDate: true,
        salesOwnerId: true,
        client: { select: { name: true } },
      },
    }).catch(() => []),
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

  // Queue A — Awaiting signature: a proposal is out (marked sent, or sitting in the
  // Proposal Sent design stage) and the deal hasn't closed.
  const awaitingSignature = projects
    .filter(p => (p.proposalSentDate || p.designStage === 'PROPOSAL_SENT')
      && p.procurementStatus === OPEN && (p.designStatus === OPEN || !p.designStatus))
    .map(shape)
    .sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1)); // longest waiting first

  // Queue B — Next actions due: any deal with an open next action, soonest/overdue first.
  const nextActions = projects
    .filter(p => p.nextActionType)
    .map(shape)
    .sort((a, b) => {
      const da = a.nextActionDueDate ? new Date(a.nextActionDueDate).getTime() : Infinity;
      const db = b.nextActionDueDate ? new Date(b.nextActionDueDate).getTime() : Infinity;
      return da - db;
    });

  return NextResponse.json({
    awaitingSignature, nextActions,
    salesUsers: users.map(u => ({ id: u.id, name: u.name || u.email })),
    counts: { awaitingSignature: awaitingSignature.length, nextActions: nextActions.length,
      overdue: nextActions.filter(a => a.overdue).length },
  });
}
