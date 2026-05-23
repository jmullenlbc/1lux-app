import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';

const TAB_PERMISSION_MAP = {
  submittals: 'canViewSubmittals',
  contracts:  'canViewContracts',
  ca:         'canViewChangeOrders',
  budgets:    'canViewBudgets',
};

export async function GET(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await prisma.projectExternalContact.findFirst({
    where: { project_id: params.id, portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
  });
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab');

  if (!tab || !TAB_PERMISSION_MAP[tab]) {
    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });
  }

  const permField = TAB_PERMISSION_MAP[tab];
  if (!contact[permField]) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const files = await prisma.projectFile.findMany({
    where:   { projectId: params.id, tab },
    select:  { id: true, originalName: true, size: true, mimeType: true, tags: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ files });
}
