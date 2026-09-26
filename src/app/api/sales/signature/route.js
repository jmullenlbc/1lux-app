import { NextResponse } from 'next/server';
import { requireAuth, requireSalesAdmin, isSalesAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { signatureTemplate } from '@/lib/bot/voice';
import { DEFAULT_SIGNATURE_TEMPLATE } from '@/lib/bot/emailStyle';

// The company email signature (Mike 9-26): one layout, each person's name,
// title, email and cell filled in. Added to every email the bot drafts.

// GET /api/sales/signature — the layout, plus your own details for the preview.
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, jobTitle: true, phone: true, signatureName: true, officePhone: true, officeExt: true } });
  return NextResponse.json({ template: await signatureTemplate(), defaultTemplate: DEFAULT_SIGNATURE_TEMPLATE, canEdit: isSalesAdmin(user), me });
}

// PUT /api/sales/signature  { template } — Sales Admins only.
export async function PUT(request) {
  const { user, error } = await requireSalesAdmin(request);
  if (error) return error;
  const b = await request.json().catch(() => ({}));
  const template = String(b.template ?? '').replace(/\r\n/g, '\n').trim().slice(0, 1000);
  if (!template) return NextResponse.json({ error: 'The signature cannot be empty.' }, { status: 400 });
  if (!/\{name\}|\{first\}/i.test(template)) return NextResponse.json({ error: 'The signature needs {name} or {first} so it shows who sent it.' }, { status: 400 });
  const row = await prisma.emailSignatureTemplate.upsert({
    where: { id: 'company' },
    update: { template, updatedById: user.id },
    create: { id: 'company', template, updatedById: user.id },
  });
  return NextResponse.json({ template: row.template });
}
