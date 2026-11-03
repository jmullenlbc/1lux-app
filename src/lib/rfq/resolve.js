// Which rep quotes each matrix line, and where each line's RFQ stands
// (Mike 10-29, migration 0144). Server only.
//
// Rep for a line, first answer wins:
//   1. this project's own pick for the manufacturer (ProjectRepPick)
//   2. the manufacturer is buy direct
//   3. the office's default rep for the manufacturer
//   4. the only active rep for the manufacturer at that office
//   otherwise the line asks "Pick a rep".
// Line status: Draft (has a manufacturer, never sent), Sent, Received (priced).
import { prisma } from '@/lib/db';
import { getProjectRates } from '@/lib/changeOrderRates';
import { LINE_STATUS, normName, rfqLabel, roundLabel } from './format';
import { familyBefore, familyOf, revisionChanges, roundsFor } from './compare';

export { normName };

/** Office for a project: its own, else a guess from the state (CA Long Beach, FL Florida, else Denver). */
export function guessOffice(project, offices) {
  if (project.ourOfficeId) {
    const own = offices.find((o) => o.id === project.ourOfficeId);
    if (own) return { office: own, guessed: false };
  }
  const st = String(project.state || String(project.location || '').split(',').pop() || '').trim().toUpperCase();
  const name = st === 'CA' ? 'Long Beach' : st === 'FL' ? 'Florida' : 'Denver';
  return { office: offices.find((o) => o.name === name) || offices[0] || null, guessed: true };
}

const lineMfrName = (it) => (it.propManufacturer || it.specManufacturer || '').trim();
const linePart = (it) => (it.propModel || it.specModel || '').trim();

/** A change order's lines in the shape the RFQ screens read. Fees and tax lines go to no rep. */
async function coItems(projectId, coId) {
  const co = await prisma.changeOrder.findFirst({
    where: { id: coId, projectId },
    select: { coNumber: true, title: true, optionGroups: { orderBy: { sortOrder: 'asc' }, select: { lineItems: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!co) return null;
  const items = co.optionGroups.flatMap((g) => g.lineItems)
    .filter((li) => !li.isFee && !li.isTaxLine && (li.fixtureType || li.manufacturer || li.description))
    .map((li) => ({
      id: li.id, typeCode: li.fixtureType, description: li.description, propManufacturer: li.manufacturer, propModel: li.partNumber, qty: li.qty, propUnitDN: li.originalDN,
      notes: [li.notes, li.qty < 0 ? 'Credit: please quote the credit and any restocking fee.' : ''].filter(Boolean).join(' '),
    }));
  return { coNumber: co.coNumber, title: co.title, items };
}

/**
 * Everything the RFQs tab shows for one project. With coId, the same state for
 * one change order: its lines, and only its RFQs. Rounds stay with the drawings.
 */
export async function rfqState(projectId, { coId = null } = {}) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, state: true, location: true, ourOfficeId: true, preconManager: { select: { name: true } } },
  });
  if (!project) return null;
  const onCo = coId ? await coItems(projectId, coId) : null;
  if (coId && !onCo) return null;
  const [offices, items, manufacturers, picks, rfqRows, rounds, rates] = await Promise.all([
    prisma.ourOffice.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    onCo ? onCo.items : prisma.peerReviewItem.findMany({ where: { projectId }, orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.manufacturer.findMany({
      select: {
        id: true, name: true, buyDirect: true,
        emails: { orderBy: { sortOrder: 'asc' } },
        repLinks: { where: { active: true }, include: { salesRep: { include: { emails: { orderBy: { sortOrder: 'asc' } } } } } },
      },
    }),
    prisma.projectRepPick.findMany({ where: { projectId } }),
    prisma.rfq.findMany({
      where: { projectId, changeOrderId: coId },
      orderBy: { number: 'desc' },
      include: {
        lines: { orderBy: { sortOrder: 'asc' }, include: { quoteLinks: { select: { quoteLine: { select: { quote: { select: { id: true, quoteNumber: true, fromName: true, fileName: true } } } } } } } },
        salesRep: { select: { id: true, name: true } }, manufacturer: { select: { id: true, name: true } },
      },
    }),
    prisma.rfqRound.findMany({ where: { projectId }, orderBy: { number: 'asc' } }),
    getProjectRates(projectId),
  ]);
  const { office, guessed } = guessOffice(project, offices);
  const rfqs = coId ? rfqRows.map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l, peerReviewItemId: l.changeOrderLineItemId })) })) : rfqRows;

  const byId = new Map(manufacturers.map((m) => [m.id, m]));
  const byName = new Map();
  for (const m of manufacturers) if (!byName.has(normName(m.name))) byName.set(normName(m.name), m);
  const findMfr = (it) => (it.propManufacturerId && byId.get(it.propManufacturerId))
    || byName.get(normName(it.propManufacturer)) || byName.get(normName(it.specManufacturer)) || null;
  const pickFor = new Map(picks.map((p) => [p.manufacturerId, p]));

  // Latest RFQ line per matrix line (rfqs are newest first).
  const lastLine = new Map();
  for (const r of rfqs) for (const l of r.lines) if (l.peerReviewItemId && !lastLine.has(l.peerReviewItemId)) lastLine.set(l.peerReviewItemId, { line: l, rfq: r });

  const repFor = (m) => {
    const pick = pickFor.get(m.id);
    if (pick) {
      if (!pick.salesRepId) return { kind: 'DIRECT', how: 'Picked for this job' };
      const link = m.repLinks.find((l) => l.salesRepId === pick.salesRepId);
      if (link) return { kind: 'REP', rep: link.salesRep, how: 'Picked for this job' };
    }
    if (m.buyDirect) return { kind: 'DIRECT', how: 'Buy direct' };
    const here = m.repLinks.filter((l) => l.officeId === office?.id || !l.officeId);
    const def = here.find((l) => l.isDefault && l.officeId === office?.id) || here.find((l) => l.isDefault);
    if (def) return { kind: 'REP', rep: def.salesRep, how: 'Default for this office' };
    const reps = [...new Map(here.map((l) => [l.salesRepId, l.salesRep])).values()];
    if (reps.length === 1) return { kind: 'REP', rep: reps[0], how: 'Only rep for this office' };
    // A rep in another office is named, so the pick is easy (9th + Clermont: Porter has Nora in Long Beach only).
    const elsewhere = reps.length ? [] : [...new Set(m.repLinks.map((l) => l.salesRep.name))];
    return { kind: 'NONE', how: reps.length ? 'More than one rep, pick one' : 'No rep on file', choices: reps, elsewhere };
  };

  const lines = [];
  const groups = new Map();
  for (const it of items) {
    const mfrName = lineMfrName(it);
    const m = mfrName ? findMfr(it) : null;
    const last = lastLine.get(it.id);
    const status = last ? (last.line.dnPrice != null ? LINE_STATUS.RECEIVED : LINE_STATUS.SENT) : mfrName ? LINE_STATUS.DRAFT : LINE_STATUS.NONE;
    const who = m ? repFor(m) : { kind: 'NONE', how: mfrName ? 'Manufacturer not in the app' : 'No manufacturer' };
    const repName = who.kind === 'REP' ? who.rep.name : who.kind === 'DIRECT' ? `${m.name} (direct)` : '';
    const row = {
      id: it.id, typeCode: it.typeCode || '', description: it.description || '', manufacturer: m?.name || mfrName,
      manufacturerId: m?.id || null, partNumber: linePart(it), qty: it.qty, notes: it.notes || '',
      repName, how: who.how, status, rfqNumber: last?.rfq.number || null, rfqLabel: last ? rfqLabel(last.rfq) : '', dnPrice: last?.line.dnPrice ?? null,
      // The rep price waits for a person's OK before it becomes the DN (0164).
      rfqLineId: last?.line.id || null, approved: !!last?.line.approvedAt, approvedByName: last?.line.approvedByName || '',
      nowDN: it.propUnitDN ?? null, priceSource: last?.line.priceSource || null, confidence: last?.line.confidence ?? null,
      quoteFrom: last ? [...new Map(last.line.quoteLinks.map((k) => [k.quoteLine.quote.id, k.quoteLine.quote])).values()] : [],
      sentTo: last?.rfq.toName || '',
    };
    lines.push(row);
    if (!mfrName) continue;
    const key = who.kind === 'REP' ? `rep:${who.rep.id}` : who.kind === 'DIRECT' ? `mfr:${m.id}` : `none:${m?.id || normName(mfrName)}`;
    if (!groups.has(key)) {
      const emails = who.kind === 'REP' ? who.rep.emails : who.kind === 'DIRECT' ? m.emails : [];
      groups.set(key, {
        key, kind: who.kind, salesRepId: who.kind === 'REP' ? who.rep.id : null, manufacturerId: who.kind === 'DIRECT' ? m.id : null,
        toName: who.kind === 'REP' ? who.rep.name : who.kind === 'DIRECT' ? m.name : (m?.name || mfrName),
        quoteEmails: emails.filter((e) => e.purpose === 'QUOTES').map((e) => e.email),
        manufacturers: [], choices: who.choices || [], elsewhere: who.elsewhere || [], officeName: office?.name || '', noMfr: !m, lines: [],
      });
    }
    const g = groups.get(key);
    if (m && !g.manufacturers.some((x) => x.id === m.id)) g.manufacturers.push({ id: m.id, name: m.name, how: who.how, reps: [...new Map(m.repLinks.map((l) => [l.salesRepId, { id: l.salesRepId, name: l.salesRep.name }])).values()] });
    g.lines.push(row);
  }

  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const sends = rfqs.map((r) => ({ ...r, roundNumber: roundById.get(r.roundId)?.number ?? null }));
  const newest = new Map(); // rfqs are newest first
  for (const r of sends) if (!newest.has(familyOf(r))) newest.set(familyOf(r), r);
  const sameRep = (g, r) => g.kind !== 'NONE' && (g.salesRepId ? r.salesRepId === g.salesRepId : !r.salesRepId && r.manufacturerId === g.manufacturerId);

  const out = [...groups.values()].map((g) => {
    const last = sends.find((r) => sameRep(g, r));
    return {
      ...g,
      draftCount: g.lines.filter((l) => l.status === LINE_STATUS.DRAFT).length,
      problems: sendProblems(g),
      lastSent: last ? { id: last.id, label: rfqLabel(last), round: roundLabel(roundById.get(last.roundId)) } : null,
    };
  });
  out.sort((a, b) => (a.kind === 'NONE') - (b.kind === 'NONE') || a.toName.localeCompare(b.toName));

  return {
    project: { id: project.id, name: project.name, pm: project.preconManager?.name || '' },
    changeOrder: onCo ? { id: coId, coNumber: onCo.coNumber, title: onCo.title } : null,
    office, officeGuessed: guessed, offices, lines, groups: out, rounds: roundsFor(rounds, sends), marginPct: rates.marginPct,
    rfqs: sends.map((r) => {
      const isLatest = newest.get(familyOf(r)).id === r.id;
      const ids = new Set(r.lines.map((l) => l.peerReviewItemId).filter(Boolean));
      const group = isLatest ? out.find((g) => sameRep(g, r)) || out.find((g) => g.lines.some((l) => ids.has(l.id))) : null;
      return {
        id: r.id, number: r.number, status: r.status, toName: r.toName, sentTo: r.sentTo, needBy: r.needBy, createdAt: r.createdAt,
        receivedAt: r.receivedAt, sentByName: r.sentByName, notes: r.notes, revisesId: r.revisesId,
        familyNumber: familyOf(r), version: r.version, addOn: r.addOn, roundId: r.roundId, round: roundLabel(roundById.get(r.roundId)),
        label: rfqLabel(r), isLatest, groupKey: group?.key || null,
        // What a revision would tell the rep if it went out now.
        pending: group ? revisionChanges(familyBefore(sends, { ...r, number: Infinity }), group.lines.map((l) => ({ ...l, peerReviewItemId: l.id }))) : [],
        lineCount: r.lines.length, pricedCount: r.lines.filter((l) => l.dnPrice != null).length,
        overdue: r.status === 'SENT' && new Date(r.needBy) < new Date(),
      };
    }),
  };
}

/** What changed since the rep's last version, for the email and the PDF. No prices. */
export async function changesFor(rfq) {
  if ((rfq.version || 1) < 2) return [];
  const rows = await prisma.rfq.findMany({
    where: { projectId: rfq.projectId, number: { lt: rfq.number }, OR: [{ familyNumber: familyOf(rfq) }, { number: familyOf(rfq) }] },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  return revisionChanges(familyBefore(rows, rfq), rfq.lines, { addOn: rfq.addOn });
}

/** Plain reasons a group cannot be sent yet. */
export function sendProblems(g) {
  const p = [];
  if (g.kind === 'NONE') p.push(g.noMfr ? 'This manufacturer is not in the app yet. Add it under Manufacturers.' : (g.choices?.length ? 'More than one rep sells this manufacturer here. Pick one.'
    : g.elsewhere?.length ? `No rep sells this manufacturer in ${g.officeName ? 'the ' + g.officeName + ' office' : 'this office'}. ${g.elsewhere.join(', ')} sells it elsewhere. Pick a rep to send.`
    : 'No rep is on file for this manufacturer. Pick a rep, or mark it buy direct.'));
  if (g.kind !== 'NONE' && !g.quoteEmails.length) p.push(g.kind === 'DIRECT' ? 'This manufacturer has no Quotes email. Add one on its page.' : 'This rep has no Quotes email. Add one on the rep page.');
  return p;
}
