import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isSalesAdmin } from '@/lib/auth';
import { requireSalesDocsUser, badRequest } from '@/lib/salesDocs/access';
import { normalizeEmail } from '@/lib/salesDocs/matching';
import { cleanText } from '@/lib/campaigns/staff';

const INCLUDE = {
  contact: { select: { id: true, name: true } },
  campaign: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

// GET /api/campaign-suppressions?lifted=1  The do-not-email list (0147).
export async function GET(request) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const lifted = new URL(request.url).searchParams.get('lifted') === '1';
  const rows = await prisma.campaignSuppression.findMany({
    where: { liftedAt: lifted ? { not: null } : null },
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 2000,
  });
  return NextResponse.json({ suppressions: rows, canLift: isSalesAdmin(user) });
}

// POST /api/campaign-suppressions { email, note }  Anyone on staff can add a
// person who asked to stop.
export async function POST(request) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!email) return badRequest('That does not look like an email address. Nothing was saved. (CAMPAIGN_SUPPRESS_EMAIL)');
  const contact = await prisma.contact.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }).catch(() => prisma.contact.findFirst({ where: { email }, select: { id: true } }));
  const row = await prisma.campaignSuppression.upsert({
    where: { email },
    create: { email, reason: 'MANUAL', note: cleanText(body.note, 500), contactId: contact?.id || null, createdById: user.id },
    update: { liftedAt: null, liftedById: null, note: cleanText(body.note, 500) },
    include: INCLUDE,
  });
  return NextResponse.json({ suppression: row }, { status: 201 });
}

// PATCH /api/campaign-suppressions { id, lifted: true|false }  Sales admins only.
// Lifting is for a person who asks to be emailed again; the row stays.
export async function PATCH(request) {
  const { user, error } = await requireSalesDocsUser();
  if (error) return error;
  if (!isSalesAdmin(user)) return badRequest('Only a sales admin can take someone off the do-not-email list. Nothing changed. (CAMPAIGN_SUPPRESS_ROLE)', 403);
  const body = await request.json().catch(() => ({}));
  const row = await prisma.campaignSuppression.findUnique({ where: { id: String(body.id || '') } });
  if (!row) return badRequest('That address was not found on the do-not-email list. Nothing changed. (CAMPAIGN_SUPPRESS_NOT_FOUND)', 404);
  const updated = await prisma.campaignSuppression.update({
    where: { id: row.id },
    data: body.lifted ? { liftedAt: new Date(), liftedById: user.id } : { liftedAt: null, liftedById: null },
    include: INCLUDE,
  });
  return NextResponse.json({ suppression: updated });
}
