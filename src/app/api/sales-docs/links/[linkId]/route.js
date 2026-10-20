import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { linkOptions, linkStatus } from '@/lib/salesDocs/linkOptions';

// PATCH /api/sales-docs/links/[linkId]  { revoke?: true, name?, expiresAt?, ... }
// Revoking is the off switch: the link page says it is no longer available.
// Links are never deleted, so their views stay on the record.
export async function PATCH(request, { params }) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const found = await prisma.salesDocLink.findUnique({ where: { id: params.linkId }, select: { id: true, revokedAt: true } });
  if (!found) return badRequest('Not found', 404);

  const opts = await linkOptions(body, { creating: false });
  if (opts.error) return badRequest(opts.error);
  const data = { ...opts.data };
  if (body.revoke === true && !found.revokedAt) Object.assign(data, { revokedAt: new Date(), revokedById: user.id });
  if (!Object.keys(data).length) return badRequest('Nothing to change.');

  const { passwordHash, ...link } = await prisma.salesDocLink.update({ where: { id: found.id }, data });
  return NextResponse.json({ link: { ...link, hasPassword: !!passwordHash, status: linkStatus(link) } });
}
