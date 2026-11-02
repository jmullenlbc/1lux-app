// RFQ writes (0144): send, price a line, mark received. Server only. Each one
// keeps the matrix line's Sales Rep, RFQ Status and DN columns in step and
// writes the RFQ's history.
import { prisma } from '@/lib/db';
import { logHistory } from '@/lib/recordHistory';
import { cents, sumCents } from '@/lib/money';
import { getProjectRates } from '@/lib/changeOrderRates';
import { needByFrom, rfqLabel, roundLabel, LINE_STATUS } from './format';
import { familyOf } from './compare';

/** The rep's newest send on this job. A loaded RFQ has no rep on it, so the one being revised starts the family. */
async function lastInFamily(tx, { projectId, group, revisesId, coId = null }) {
  const rep = group.salesRepId ? { salesRepId: group.salesRepId } : { salesRepId: null, manufacturerId: group.manufacturerId };
  const own = await tx.rfq.findFirst({ where: { projectId, changeOrderId: coId, ...rep }, orderBy: { number: 'desc' } });
  if (own || !revisesId) return own;
  return tx.rfq.findFirst({ where: { id: revisesId, projectId, salesRepId: null, manufacturerId: null } });
}

/** Sends go into the job's newest round; the first send starts round 1. */
async function currentRound(tx, projectId) {
  const last = await tx.rfqRound.findFirst({ where: { projectId }, orderBy: { number: 'desc' } });
  return last || tx.rfqRound.upsert({ where: { projectId_number: { projectId, number: 1 } }, create: { projectId, number: 1 }, update: {} });
}

const roundName = (name) => String(name || '').trim().slice(0, 80);

/** Start the job's next round: a new drawing submission such as VE or GMP. */
export async function startRound({ projectId, name, user }) {
  for (let tries = 0; ; tries++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const top = await tx.rfqRound.aggregate({ where: { projectId }, _max: { number: true } });
        const round = await tx.rfqRound.create({
          data: { projectId, number: (top._max.number || 0) + 1, name: roundName(name), createdById: user?.id || null, createdByName: user?.name || user?.email || null },
        });
        await logHistory({ entityType: 'RFQ_ROUND', entityId: round.id, action: 'CREATE', user, db: tx, note: `${roundLabel(round)} started` });
        return round;
      });
    } catch (e) {
      if (e?.code === 'P2002' && tries < 3) continue; // two people started one at once
      throw e;
    }
  }
}

/** Rename a round. A blank name shows as Round 2. Returns false when the round is not on this job. */
export async function renameRound({ projectId, roundId, name, user }) {
  const round = await prisma.rfqRound.findFirst({ where: { id: roundId, projectId } });
  if (!round) return false;
  const next = roundName(name);
  if (next !== round.name) {
    await prisma.rfqRound.update({ where: { id: roundId }, data: { name: next } });
    await logHistory({ entityType: 'RFQ_ROUND', entityId: roundId, action: 'UPDATE', user, changes: { Name: [round.name, next] } });
  }
  return true;
}

/**
 * Send one group's lines. group comes from rfqState(); lineIds narrows it
 * (default: the Draft lines). A revision goes out with the rep's whole list and
 * replaces what they had; a later plain send adds lines to it. Returns the new
 * Rfq with lines.
 */
export async function sendRfq({ projectId, group, lineIds, notes, officeId, user, revisesId = null, coId = null }) {
  const pick = revisesId ? group.lines : lineIds?.length ? group.lines.filter((l) => lineIds.includes(l.id)) : group.lines.filter((l) => l.status === LINE_STATUS.DRAFT);
  if (!pick.length) return { error: 'Every line for this rep was already sent, so nothing was sent. Open the rep under Sent RFQs and press Send revision. (RFQ_NOTHING_TO_SEND)' };
  const sentAt = new Date();
  for (let tries = 0; ; tries++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const top = await tx.rfq.aggregate({ _max: { number: true } });
        const number = (top._max.number || 0) + 1;
        const prior = await lastInFamily(tx, { projectId, group, revisesId, coId });
        const round = coId ? null : await currentRound(tx, projectId); // a change order is not a drawing round
        const rfq = await tx.rfq.create({
          data: {
            number, projectId, salesRepId: group.salesRepId, manufacturerId: group.manufacturerId, officeId: officeId || null,
            familyNumber: prior ? familyOf(prior) : number, version: prior ? (prior.version || 1) + 1 : 1, addOn: !!prior && !revisesId, roundId: round?.id ?? null, changeOrderId: coId,
            toName: group.toName, sentTo: group.quoteEmails.join(', '), needBy: needByFrom(sentAt), notes: String(notes || '').trim() || null,
            sentById: user?.id || null, sentByName: user?.name || user?.email || null, revisesId,
            lines: {
              create: pick.map((l, i) => ({
                peerReviewItemId: coId ? null : l.id, changeOrderLineItemId: coId ? l.id : null,
                typeCode: l.typeCode, manufacturer: l.manufacturer, partNumber: l.partNumber,
                notes: l.notes, qty: l.qty, sortOrder: i,
              })),
            },
          },
          include: { lines: { orderBy: { sortOrder: 'asc' } } },
        });
        if (!coId) {
          await tx.peerReviewItem.updateMany({
            where: { id: { in: pick.map((l) => l.id) } },
            data: { repName: group.kind === 'DIRECT' ? `${group.toName} (direct)` : group.toName, repEmail: group.quoteEmails[0] || null, rfqStatus: LINE_STATUS.SENT },
          });
        }
        await logHistory({
          entityType: 'RFQ', entityId: rfq.id, action: 'SEND', user, db: tx,
          note: `${rfqLabel(rfq)} sent to ${group.toName} (${rfq.sentTo || 'no email'}), ${pick.length} line${pick.length === 1 ? '' : 's'}${revisesId ? ', revision' : rfq.addOn ? ', added to what they had' : ''}, ${coId ? 'change order' : roundLabel(round)}`,
        });
        return { rfq };
      });
    } catch (e) {
      if (e?.code === 'P2002' && tries < 3) continue; // two people sent at once; take the next number
      throw e;
    }
  }
}

/** A rep's price lands on the CO line while the CO is a draft. A credit keeps the sell the client paid. */
async function priceCoLine(tx, lineId, price) {
  const li = await tx.changeOrderLineItem.findUnique({
    where: { id: lineId },
    select: { qty: true, optionGroup: { select: { changeOrder: { select: { projectId: true, status: true } } } } },
  });
  const co = li?.optionGroup.changeOrder;
  if (co?.status !== 'DRAFT') return;
  const { marginPct } = await getProjectRates(co.projectId, tx);
  await tx.changeOrderLineItem.update({
    where: { id: lineId },
    data: { originalDN: price, ...(li.qty >= 0 && { cnUnitPrice: cents(price / (1 - marginPct)) }) },
  });
}

/** Put a DN price on one RFQ line and its matrix or change order line. source AUTO | PICKED | TYPED. */
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
  if (line.changeOrderLineItemId && price != null) await priceCoLine(tx, line.changeOrderLineItemId, price);
  await logHistory({
    entityType: 'RFQ', entityId: line.rfqId, action: 'RECEIVE', user, db: tx,
    changes: { [`${line.typeCode || 'Line'} DN price`]: [null, price] },
    note: { AUTO: 'Matched from the rep quote (75% or better)', PICKED: 'Matched by hand from the rep quote', TYPED: 'Typed in' }[source] || null,
  });
  await refreshRfqStatus(tx, line.rfqId);
  return line;
}

/**
 * An RFQ line's price is its quote rows added up: one row keeps its printed price,
 * a row counts once whatever its quantity, and no rows left clears the price.
 */
export async function repriceLine(tx, { rfqLineId, source, user }) {
  const links = await tx.rfqQuoteLink.findMany({ where: { rfqLineId }, select: { quoteLine: { select: { unitPrice: true, confidence: true } } } });
  const rows = links.map((k) => k.quoteLine);
  const price = rows.length > 1 ? sumCents(rows.map((r) => r.unitPrice)) : rows[0]?.unitPrice ?? null;
  const confidence = source === 'AUTO' && rows.length ? Math.min(...rows.map((r) => r.confidence ?? 0)) : null;
  return priceLine(tx, { rfqLineId, price, source, confidence, user });
}

// A row left with no RFQ line goes back to this status.
async function settleRow(tx, quoteLineId, status) {
  const left = await tx.rfqQuoteLink.count({ where: { quoteLineId } });
  if (!left) await tx.rfqQuoteLine.update({ where: { id: quoteLineId }, data: { status } });
}

/**
 * Point rows of one quote at RFQ lines. links: [{ quoteLineId, rfqLineId }].
 * Rows add up only inside one quote: this quote replaces any other on those lines,
 * so a revised quote never adds on top of the first one.
 */
export async function linkRows(tx, { quoteId, links, source, user }) {
  const lineIds = [...new Set(links.map((k) => k.rfqLineId))];
  const replaced = await tx.rfqQuoteLink.findMany({
    where: { rfqLineId: { in: lineIds }, quoteLine: { quoteId: { not: quoteId } } },
    select: { id: true, quoteLineId: true },
  });
  await tx.rfqQuoteLink.deleteMany({ where: { id: { in: replaced.map((k) => k.id) } } });
  for (const id of new Set(replaced.map((k) => k.quoteLineId))) await settleRow(tx, id, 'REPLACED');
  for (const k of links) {
    await tx.rfqQuoteLink.upsert({ where: { quoteLineId_rfqLineId: k }, create: k, update: {} });
  }
  await tx.rfqQuoteLine.updateMany({ where: { id: { in: links.map((k) => k.quoteLineId) } }, data: { status: source } });
  for (const rfqLineId of lineIds) await repriceLine(tx, { rfqLineId, source, user });
}

/** A typed price takes the line over from its quote rows. Clearing it sends them back to ask. */
export async function typePrice(tx, { rfqLineId, price, user }) {
  const links = await tx.rfqQuoteLink.findMany({ where: { rfqLineId }, select: { quoteLineId: true } });
  await tx.rfqQuoteLink.deleteMany({ where: { rfqLineId } });
  for (const { quoteLineId } of links) await settleRow(tx, quoteLineId, price == null ? 'OPEN' : 'REPLACED');
  return priceLine(tx, { rfqLineId, price, source: 'TYPED', user });
}

/** This row stops pricing that RFQ line. */
export async function unlinkRow(tx, { quoteLineId, rfqLineId, user }) {
  await tx.rfqQuoteLink.deleteMany({ where: { quoteLineId, rfqLineId } });
  await settleRow(tx, quoteLineId, 'OPEN');
  await repriceLine(tx, { rfqLineId, source: 'PICKED', user });
}

/** Not ours: the row stops pricing everything it priced. */
export async function skipRow(tx, { quoteLineId, user }) {
  const links = await tx.rfqQuoteLink.findMany({ where: { quoteLineId }, select: { rfqLineId: true } });
  await tx.rfqQuoteLink.deleteMany({ where: { quoteLineId } });
  await tx.rfqQuoteLine.update({ where: { id: quoteLineId }, data: { status: 'SKIPPED' } });
  for (const { rfqLineId } of links) await repriceLine(tx, { rfqLineId, source: 'PICKED', user });
}

/** RECEIVED once every line has a price; back to SENT if one is cleared. */
export async function refreshRfqStatus(tx, rfqId) {
  const lines = await tx.rfqLine.findMany({ where: { rfqId }, select: { dnPrice: true } });
  const done = lines.length > 0 && lines.every((l) => l.dnPrice != null);
  const rfq = await tx.rfq.findUnique({ where: { id: rfqId }, select: { status: true } });
  if (done && rfq.status !== 'RECEIVED') await tx.rfq.update({ where: { id: rfqId }, data: { status: 'RECEIVED', receivedAt: new Date() } });
  if (!done && rfq.status === 'RECEIVED') await tx.rfq.update({ where: { id: rfqId }, data: { status: 'SENT', receivedAt: null } });
}
