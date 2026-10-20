import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { isSalesAdmin } from '@/lib/auth';
import { promoteIfReady } from '@/lib/salesDocs/process';

// POST /api/sales-docs/versions/[versionId]/override  { reason }
// A Super Admin or Sales Admin clears a blocked file to share. The reason is
// kept on the version. Hidden sheets, rows and columns stay out of the view.
export async function POST(request, { params }) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  if (!isSalesAdmin(user)) return badRequest('Only a Sales Admin or Super Admin can clear a blocked file.', 403);

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason || '').trim().slice(0, 500);
  if (reason.length < 5) return badRequest('Say why this file is safe to share.');

  const claim = await prisma.salesDocVersion.updateMany({
    where: { id: params.versionId, scanStatus: 'BLOCKED', processStatus: 'READY' },
    data: { scanStatus: 'OVERRIDDEN', scanOverrideById: user.id, scanOverrideReason: reason, scanOverriddenAt: new Date() },
  });
  if (!claim.count) return badRequest('This version is not blocked.', 409);
  const promoted = await promoteIfReady(params.versionId);
  return NextResponse.json({ ok: true, promoted });
}
