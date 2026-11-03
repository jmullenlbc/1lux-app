import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { changesFor, rfqState } from '@/lib/rfq/resolve';
import { approveLine, renameRound, sendRfq, startRound } from '@/lib/rfq/actions';
import { emailBody, emailSubject } from '@/lib/rfq/format';
import { linkHistory } from '@/lib/salesReps/links';

const NO_PROJECT = () => NextResponse.json({ error: 'That project is not in the app any more. Nothing was changed. (RFQ_NO_PROJECT)' }, { status: 404 });

// GET  the RFQs tab: lines with rep and status, one group per rep, sent RFQs (0144).
export async function GET(request, { params }) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const state = await rfqState(params.id, { coId: new URL(request.url).searchParams.get('coId') });
  if (!state) return NO_PROJECT();
  return NextResponse.json(state);
}

// POST { action: 'office', officeId }                       which ILC office works the job
//      { action: 'pick', manufacturerId | manufacturerIds, salesRepId | null } this job's rep for a manufacturer (null = buy direct); clear:true goes back to the default
//      { action: 'send', groupKey, lineIds?, notes?, revisesId? }
//      { action: 'round', name }                             start the next round (a new drawing submission)
//      { action: 'roundName', roundId, name }                rename a round
//      { action: 'approve', rfqLineIds, coId? }              a person's OK: the rep price becomes the DN (0164)
export async function POST(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const body = await request.json();
  const projectId = params.id;

  if (body.action === 'office') {
    const office = body.officeId ? await prisma.ourOffice.findUnique({ where: { id: body.officeId } }) : null;
    if (body.officeId && !office) return NextResponse.json({ error: 'That office is not in the app. Nothing was changed. (RFQ_BAD_OFFICE)' }, { status: 400 });
    await prisma.project.update({ where: { id: projectId }, data: { ourOfficeId: office?.id || null } });
    return NextResponse.json(await rfqState(projectId));
  }

  if (body.action === 'pick') {
    const { salesRepId = null, clear = false } = body;
    const ids = [...new Set([...(body.manufacturerIds || []), body.manufacturerId].filter(Boolean))];
    if (!ids.length) return NextResponse.json({ error: 'Pick a manufacturer first. Nothing was changed. (RFQ_PICK_NO_MFR)' }, { status: 400 });
    if (salesRepId && !(await prisma.salesRep.findUnique({ where: { id: salesRepId }, select: { id: true } }))) {
      return NextResponse.json({ error: 'That rep is not in the app any more. Nothing was changed. Reload the page. (RFQ_PICK_NO_REP)' }, { status: 400 });
    }
    // Any rep can be picked (Mike 10-29). A rep who does not sell the
    // manufacturer yet gets the link, for this job's office, so the next job
    // offers them too.
    const officeId = salesRepId ? (await rfqState(projectId))?.office?.id || null : null;
    await prisma.$transaction(async (tx) => {
      for (const manufacturerId of ids) {
        if (clear) { await tx.projectRepPick.deleteMany({ where: { projectId, manufacturerId } }); continue; }
        if (salesRepId && !(await tx.manufacturerRep.findFirst({ where: { manufacturerId, salesRepId, active: true } }))) {
          const dup = await tx.manufacturerRep.findFirst({ where: { manufacturerId, salesRepId } });
          const link = dup
            ? await tx.manufacturerRep.update({ where: { id: dup.id }, data: { active: true } })
            : await tx.manufacturerRep.create({ data: { manufacturerId, salesRepId, officeId } });
          await linkHistory(tx, link, 'ADD', user);
        }
        await tx.projectRepPick.upsert({
          where: { projectId_manufacturerId: { projectId, manufacturerId } },
          create: { projectId, manufacturerId, salesRepId },
          update: { salesRepId },
        });
      }
    });
    return NextResponse.json(await rfqState(projectId));
  }

  if (body.action === 'round') {
    if (!(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) return NO_PROJECT();
    await startRound({ projectId, name: body.name, user });
    return NextResponse.json(await rfqState(projectId));
  }

  if (body.action === 'roundName') {
    if (!(await renameRound({ projectId, roundId: body.roundId, name: body.name, user }))) {
      return NextResponse.json({ error: 'That round is not on this job any more. Nothing was changed. Reload the page. (RFQ_NO_ROUND)' }, { status: 400 });
    }
    return NextResponse.json(await rfqState(projectId));
  }

  if (body.action === 'approve') {
    const ids = [...new Set(body.rfqLineIds || [])].filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: 'Pick at least one line to approve. Nothing was changed. (RFQ_APPROVE_NONE)' }, { status: 400 });
    const found = await prisma.rfqLine.count({ where: { id: { in: ids }, rfq: { projectId } } });
    if (found !== ids.length) return NextResponse.json({ error: 'One of those lines is not on this job any more. Nothing was changed. Reload the page. (RFQ_APPROVE_BAD_LINE)' }, { status: 400 });
    let missed = 0;
    try {
      await prisma.$transaction(async (tx) => {
        for (const rfqLineId of ids) if (!(await approveLine(tx, { rfqLineId, user })).landed) missed++;
      }, { timeout: 20000 });
    } catch (e) {
      if (String(e?.code || '').startsWith('RFQ_')) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
    return NextResponse.json({ approved: ids.length, missed, state: await rfqState(projectId, { coId: body.coId || null }) });
  }

  if (body.action === 'send') {
    const coId = body.coId || null;
    const state = await rfqState(projectId, { coId });
    if (!state) return NO_PROJECT();
    const group = state.groups.find((g) => g.key === body.groupKey);
    if (!group) return NextResponse.json({ error: 'That rep has no lines on this matrix any more. Nothing was sent. Reload the page. (RFQ_NO_GROUP)' }, { status: 400 });
    if (group.problems.length) return NextResponse.json({ error: `${group.problems.join(' ')} Nothing was sent. (RFQ_NOT_READY)` }, { status: 400 });
    const co = state.changeOrder;
    const notes = co ? [`Change order ${co.coNumber}${co.title ? `: ${co.title}` : ''}`, body.notes].filter(Boolean).join('. ') : body.notes;
    const res = await sendRfq({ projectId, group, lineIds: body.lineIds, notes, officeId: state.office?.id, user, revisesId: body.revisesId || null, coId });
    if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
    const info = {
      number: res.rfq.number, familyNumber: res.rfq.familyNumber, version: res.rfq.version, projectName: state.project.name,
      needBy: res.rfq.needBy, notes: res.rfq.notes, office: state.office, changes: await changesFor(res.rfq),
    };
    return NextResponse.json({
      rfq: res.rfq,
      email: { to: res.rfq.sentTo, subject: emailSubject(info), body: emailBody(info) },
      state: await rfqState(projectId, { coId }),
    }, { status: 201 });
  }

  return NextResponse.json({ error: 'The app did not understand that request. Nothing was changed. (RFQ_BAD_ACTION)' }, { status: 400 });
}
