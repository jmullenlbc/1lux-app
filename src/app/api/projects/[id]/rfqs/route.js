import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rfqState } from '@/lib/rfq/resolve';
import { sendRfq } from '@/lib/rfq/actions';
import { emailBody, emailSubject } from '@/lib/rfq/format';

const NO_PROJECT = () => NextResponse.json({ error: 'That project is not in the app any more. Nothing was changed. (RFQ_NO_PROJECT)' }, { status: 404 });

// GET  the RFQs tab: lines with rep and status, one group per rep, sent RFQs (0144).
export async function GET(request, { params }) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const state = await rfqState(params.id);
  if (!state) return NO_PROJECT();
  return NextResponse.json(state);
}

// POST { action: 'office', officeId }                       which ILC office works the job
//      { action: 'pick', manufacturerId, salesRepId | null } this job's rep for a manufacturer (null = buy direct); clear:true goes back to the default
//      { action: 'send', groupKey, lineIds?, notes?, revisesId? }
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
    const { manufacturerId, salesRepId = null, clear = false } = body;
    if (!manufacturerId) return NextResponse.json({ error: 'Pick a manufacturer first. Nothing was changed. (RFQ_PICK_NO_MFR)' }, { status: 400 });
    if (clear) await prisma.projectRepPick.deleteMany({ where: { projectId, manufacturerId } });
    else {
      await prisma.projectRepPick.upsert({
        where: { projectId_manufacturerId: { projectId, manufacturerId } },
        create: { projectId, manufacturerId, salesRepId },
        update: { salesRepId },
      });
    }
    return NextResponse.json(await rfqState(projectId));
  }

  if (body.action === 'send') {
    const state = await rfqState(projectId);
    if (!state) return NO_PROJECT();
    const group = state.groups.find((g) => g.key === body.groupKey);
    if (!group) return NextResponse.json({ error: 'That rep has no lines on this matrix any more. Nothing was sent. Reload the page. (RFQ_NO_GROUP)' }, { status: 400 });
    if (group.problems.length) return NextResponse.json({ error: `${group.problems.join(' ')} Nothing was sent. (RFQ_NOT_READY)` }, { status: 400 });
    const res = await sendRfq({ projectId, group, lineIds: body.lineIds, notes: body.notes, officeId: state.office?.id, user, revisesId: body.revisesId || null });
    if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
    const info = { number: res.rfq.number, projectName: state.project.name, needBy: res.rfq.needBy, notes: res.rfq.notes, office: state.office };
    return NextResponse.json({
      rfq: res.rfq,
      email: { to: res.rfq.sentTo, subject: emailSubject(info), body: emailBody(info) },
      state: await rfqState(projectId),
    }, { status: 201 });
  }

  return NextResponse.json({ error: 'The app did not understand that request. Nothing was changed. (RFQ_BAD_ACTION)' }, { status: 400 });
}
