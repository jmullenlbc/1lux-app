import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { processVersion, STALE_PROCESS_MS } from '@/lib/salesDocs/process';

// Reads the file once: page count, pricing check, drawn sheets. The browser
// POSTs right after upload; if that call is cut off it polls GET and POSTs
// again once a PENDING has sat for two minutes.
export const runtime = 'nodejs';
export const maxDuration = 60;

const STATUS = { id: true, docId: true, version: true, processStatus: true, processError: true, scanStatus: true, pageCount: true, processStartedAt: true };

const shape = (v) => ({
  version: v,
  stale: v.processStatus === 'PENDING' && (!v.processStartedAt || Date.now() - new Date(v.processStartedAt).getTime() > STALE_PROCESS_MS),
});

export async function GET(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const v = await prisma.salesDocVersion.findUnique({ where: { id: params.versionId }, select: STATUS });
  if (!v) return badRequest('Not found', 404);
  return NextResponse.json(shape(v));
}

export async function POST(request, { params }) {
  const { error } = await requireSalesDocsUser();
  if (error) return error;
  const found = await prisma.salesDocVersion.findUnique({ where: { id: params.versionId }, select: { id: true } });
  if (!found) return badRequest('Not found', 404);
  await processVersion(params.versionId);
  const v = await prisma.salesDocVersion.findUnique({ where: { id: params.versionId }, select: STATUS });
  return NextResponse.json(shape(v));
}
