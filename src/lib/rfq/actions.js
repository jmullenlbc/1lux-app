// RFQ writes (0144): send, price a line, mark received. Server only. Each one
// keeps the matrix line's Sales Rep, RFQ Status and DN columns in step and
// writes the RFQ's history.
import { prisma } from '@/lib/db';
import { logHistory } from '@/lib/recordHistory';
import { needByFrom, rfqNumber, LINE_STATUS } from './format';

/**
 * Send one group's lines. group comes from rfqState(); lineIds narrows it
 * (default: the Draft lines). Returns the new Rfq with lines.
 */
export async function sendRfq({ projectId, group, lineIds, notes, officeId, user, revisesId = null }) {
  const pick = lineIds?.length ? group.lines.filter((l) => lineIds.includes(l.id)) : group.lines.filter((l) => l.status === LINE_STATUS.DRAFT);
  if (!pick.length) return { error: 'Every line for this rep was already sent. Use Send again on the sent RFQ to send a revision. (RFQ_NOTHING_TO_SEND)' };
  const sentAt = new Date();
  for (let tries = 0; ; tries++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const top = await tx.rfq.aggregate({ _max: { number: true } });
        const number = (top._max.number || 0) + 1;
        const rfq = await tx.rfq.create({
          data: {
            number, projectId, salesRepId: group.salesRepId, manufacturerId: group.manufacturerId, officeId: officeId || null,
            toName: group.toName, sentTo: group.quoteEmails.join(', '), needBy: needByFrom(sentAt), notes: String(notes || '').trim() || null,
            sentById: user?.id || null, sentByName: user?.name || user?.email || null, revisesId,
            lines: {
              create: pick.map((l, i) => ({
                peerReviewItemId: l.id, typeCode: l.typeCode, manufacturer: l.manufacturer, partNumber: l.partNumber,
                notes: l.notes, qty: l.qty, sortOrder: i,
              })),
            },
          },
          include: { lines: { orderBy: { sortOrder: 'asc' } } },
        });
        await tx.peerReviewItem.updateMany({
          where: { id: { in: pick.map((l) => l.id) } },
          data: { repName: group.kind === 'DIRECT' ? `${group.toName} (direct)` : group.toName, repEmail: group.quoteEmails[0] || null, rfqStatus: LINE_STATUS.SENT },
        });
        await logHistory({
          entityType: 'RFQ', entityId: rfq.id, action: 'SEND', user, db: tx,
          note: `${rfqNumber(number)} sent to ${group.toName} (${rfq.sentTo || 'no email'}), ${pick.length} line${pick.length === 1 ? '' : 's'}${revisesId ? ', revision' : ''}`,
        });
        return { rfq };
      });
    } catch (e) {
      if (e?.code === 'P2002' && tries < 3) continue; // two people sent at once; take the next number
      throw e;
    }
  }
}

/** Put a DN price on one RFQ line and its matrix line. source AUTO | PICKED | TYPED. */
export async function priceLine(tx, { rfqLineId, price, source, confidence = null, user }) {
  const line = await tx.rfqLine.update({
    where: { id: rfqLineId },
    data: { dnPrice: price, priceSource: price == null ? null : source, confidence, receivedAt: price == null ? null : new Date() },
  });
  if (line.peerReviewItemId) {
    await tx.peerReviewItem.update({
      where: { id: line.peerReviewItemId },
      data: { propUnitDN: price, rfqStatus: price == null ? LINE_STATUS.SENT : LINE_STATUS.RECEIVED },
    }).catch(() => {}); // the matrix line may have been deleted since
  }
  await logHistory({
    entityType: 'RFQ', entityId: line.rfqId, action: 'RECEIVE', user, db: tx,
    changes: { [`${line.typeCode || 'Line'} DN price`]: [null, price] },
    note: { AUTO: 'Matched from the rep quote (75% or better)', PICKED: 'Matched by hand from the rep quote', TYPED: 'Typed in' }[source] || null,
  });
  await refreshRfqStatus(tx, line.rfqId);
  return line;
}

/** RECEIVED once every line has a price; back to SENT if one is cleared. */
export async function refreshRfqStatus(tx, rfqId) {
  const lines = await tx.rfqLine.findMany({ where: { rfqId }, select: { dnPrice: true } });
  const done = lines.length > 0 && lines.every((l) => l.dnPrice != null);
  const rfq = await tx.rfq.findUnique({ where: { id: rfqId }, select: { status: true } });
  if (done && rfq.status !== 'RECEIVED') await tx.rfq.update({ where: { id: rfqId }, data: { status: 'RECEIVED', receivedAt: new Date() } });
  if (!done && rfq.status === 'RECEIVED') await tx.rfq.update({ where: { id: rfqId }, data: { status: 'SENT', receivedAt: null } });
}
