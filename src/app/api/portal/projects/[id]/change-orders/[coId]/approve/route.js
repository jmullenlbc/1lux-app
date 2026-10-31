import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';
import { approveChangeOrder } from '@/lib/changeOrderApproval';

// POST, the client approves a sent change order. Seeing is not signing: staff
// turn approval on per person on the job's Contacts tab.
export async function POST(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await prisma.projectExternalContact.findFirst({
    where: { project_id: params.id, portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
  });
  if (!contact?.canViewChangeOrders || !contact?.canApproveChangeOrders) {
    return NextResponse.json({ error: 'Your portal account cannot approve change orders on this job. Nothing was changed. Ask your ILC rep to turn this on.' }, { status: 403 });
  }

  const { status, body } = await approveChangeOrder({
    projectId: params.id, coId: params.coId, via: 'PORTAL', from: ['SENT'], portalUserId: portalUser.portalUserId,
  });
  return NextResponse.json(body, { status });
}
