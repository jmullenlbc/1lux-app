import { prisma } from '@/lib/db';
import { getProjectRates, calcCOTotal } from '@/lib/changeOrderRates';

const CO_WITH_LINES = { optionGroups: { include: { lineItems: true } } };

/**
 * Approves a change order and logs who, when, how, which option and the total.
 * The sales tax locks here too, for a change order approved without being sent.
 * Clients approve through the portal, staff record a phone or email approval.
 * Returns { status, body } for the route to send back.
 */
export async function approveChangeOrder({ projectId, coId, via, from, userId = null, portalUserId = null, note = null }) {
  const co = await prisma.changeOrder.findFirst({ where: { id: coId, projectId }, include: CO_WITH_LINES });
  if (!co) return { status: 404, body: { error: 'That change order was not found on this job. Nothing was changed.' } };
  if (co.status === 'APPROVED') return { status: 200, body: { ok: true, already: true } };
  if (!from.includes(co.status)) {
    return { status: 400, body: { error: `This change order is ${co.status.toLowerCase()} and cannot be approved yet. Nothing was changed.` } };
  }

  const selected = co.optionGroups.find(g => g.isSelected);
  if (!selected) {
    return { status: 400, body: { error: 'No option is chosen on this change order, so it cannot be approved. Nothing was changed. Choose one and try again.' } };
  }

  const rates     = await getProjectRates(projectId);
  const frozenTax = co.salesTaxPct ?? rates.salesTaxPct ?? 0;
  const amount    = calcCOTotal({ ...co, salesTaxPct: frozenTax }, rates);

  const approved = await prisma.$transaction(async tx => {
    // Only a change order still in the expected status flips, so two people
    // pressing at once log one approval
    const { count } = await tx.changeOrder.updateMany({
      where: { id: coId, status: { in: from } },
      data:  { status: 'APPROVED', salesTaxPct: frozenTax },
    });
    if (count === 0) return false;
    await tx.changeOrderApproval.create({
      data: { changeOrderId: coId, action: 'APPROVED', via, userId, portalUserId, note, optionLabel: selected.label, amount },
    });
    return true;
  });

  if (!approved) {
    return { status: 409, body: { error: 'This change order changed while you were approving it. Nothing was changed. Reload and try again.' } };
  }
  return { status: 200, body: { ok: true, amount } };
}

/** Puts an approved change order back to Sent. The sales tax stays frozen. */
export async function undoApproval({ projectId, coId, userId, note = null }) {
  const co = await prisma.changeOrder.findFirst({ where: { id: coId, projectId } });
  if (!co) return { status: 404, body: { error: 'That change order was not found on this job. Nothing was changed.' } };
  if (co.status !== 'APPROVED') return { status: 400, body: { error: 'This change order is not approved, so there is nothing to undo.' } };

  await prisma.$transaction([
    prisma.changeOrder.update({ where: { id: coId }, data: { status: 'SENT' } }),
    prisma.changeOrderApproval.create({ data: { changeOrderId: coId, action: 'UNDONE', via: 'STAFF', userId, note } }),
  ]);
  return { status: 200, body: { ok: true } };
}
