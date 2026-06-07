import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const PROPOSAL_FULL_INCLUDE = {
  project:   { select: { id: true, name: true, city: true, state: true, lifecycleStatus: true, clientId: true } },
  deal:      { select: { id: true, dealNumber: true, pipeline: true, stage: true } },
  template:  { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  lineItems: { orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] },
  sends:     { include: { sentBy: { select: { id: true, name: true } } }, orderBy: { sentAt: 'desc' } },
};

export async function GET(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: PROPOSAL_FULL_INCLUDE,
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(proposal);
}

export async function PUT(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const proposal = await prisma.proposal.findUnique({ where: { id: params.id } });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const {
    title, docBody, clientName, clientLegalName, location, effectiveDate,
    overrideFee, overrideActive, adderPct, milestoneSplit, calculatedFee,
  } = body;

  const updated = await prisma.proposal.update({
    where: { id: params.id },
    data: {
      ...(title            !== undefined && { title }),
      ...(docBody          !== undefined && { docBody }),
      ...(clientName       !== undefined && { clientName }),
      ...(clientLegalName  !== undefined && { clientLegalName }),
      ...(location         !== undefined && { location }),
      ...(effectiveDate    !== undefined && { effectiveDate: effectiveDate ? new Date(effectiveDate) : null }),
      ...(overrideFee      !== undefined && { overrideFee }),
      ...(overrideActive   !== undefined && { overrideActive }),
      ...(adderPct         !== undefined && { adderPct }),
      ...(milestoneSplit   !== undefined && { milestoneSplit }),
      ...(calculatedFee    !== undefined && { calculatedFee }),
    },
    include: PROPOSAL_FULL_INCLUDE,
  });

  return NextResponse.json(updated);
}
