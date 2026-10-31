import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProjectRates, calcCOTotal, ratesForCO } from '@/lib/changeOrderRates';

const CO_INCLUDE = {
  optionGroups: {
    orderBy: { sortOrder: 'asc' },
    include: { lineItems: { orderBy: [{ sortOrder: 'asc' }] } },
  },
  createdBy: { select: { name: true, email: true } },
};

function coEmail({ co, projectName, total, notes, shareUrl, portalUrl, senderName }) {
  const money = total.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return [
    `Please find attached change order ${co.coNumber}: ${co.title}${projectName ? ` on ${projectName}` : ''}.`,
    '',
    `Total: ${money}`,
    ...(notes ? ['', notes] : []),
    ...(shareUrl ? ['', `View it online: ${shareUrl}`] : []),
    ...(portalUrl ? ['', `Approve it in your ILC portal: ${portalUrl}`] : []),
    '',
    'Thanks,',
    senderName,
    'ILC Studios',
  ].join('\n');
}

// POST /api/projects/[id]/change-orders/[coId]/send
// Body: { recipients: string (comma-sep), notes?: string }
// Records the send, freezes the sales tax, DRAFT → SENT. The app has no email
// sender yet, so this returns a ready email for the person to send from Gmail.
export async function POST(req, { params }) {
  const { user, error } = await requirePermission(req, 'editJobMoney'); // Construction, Operations, Finance, admins
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({
    where:   { id: params.coId },
    include: CO_INCLUDE,
  });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'CO is already approved' }, { status: 400 });

  const selected = co.optionGroups.find(g => g.isSelected);
  if (!selected) return NextResponse.json({ error: 'No option is chosen on this change order, so it was not sent. Nothing was changed. Choose an option and try again.' }, { status: 400 });

  const body  = await req.json().catch(() => ({}));
  const { recipients, notes } = body;
  if (!recipients?.trim()) return NextResponse.json({ error: 'recipients required' }, { status: 400 });

  const project = await prisma.project.findUnique({
    where:  { id: params.id },
    select: { name: true, address: true, city: true, state: true },
  });
  const rates     = await getProjectRates(params.id);
  const frozenTax = co.salesTaxPct ?? rates.salesTaxPct ?? 0;
  const total     = calcCOTotal({ ...co, salesTaxPct: frozenTax }, rates);

  // Create send record + transition to SENT in transaction
  const [send] = await prisma.$transaction([
    prisma.changeOrderSend.create({
      data: {
        changeOrderId: params.coId,
        sentById:      user.id,
        recipients:    recipients.trim(),
        notes:         notes?.trim() || null,
      },
      include: { sentBy: { select: { name: true, email: true } } },
    }),
    prisma.changeOrder.update({
      where: { id: params.coId },
      data:  { salesTaxPct: frozenTax, ...(co.status === 'DRAFT' && { status: 'SENT' }) },
    }),
  ]);

  // Re-fetch updated CO
  const updated = await prisma.changeOrder.findUnique({
    where: { id: params.coId },
    include: {
      ...CO_INCLUDE,
      sends:  { orderBy: { sentAt: 'desc' }, include: { sentBy: { select: { name: true, email: true } } } },
      shares: { select: { token: true, createdAt: true } },
    },
  });

  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const share   = await prisma.changeOrderShare.findFirst({
    where: { changeOrderId: params.coId }, orderBy: { createdAt: 'desc' }, select: { token: true },
  });
  const signers = await prisma.projectExternalContact.count({
    where: { project_id: params.id, canViewChangeOrders: true, canApproveChangeOrders: true, acceptedAt: { not: null } },
  });

  return NextResponse.json({
    co: { ...updated, totalValue: calcCOTotal(updated, rates), rates: ratesForCO(updated, rates) },
    send,
    email: {
      to:      recipients.trim(),
      subject: `Change Order ${co.coNumber}: ${co.title}${project?.name ? `, ${project.name}` : ''}`,
      body:    coEmail({
        co, projectName: project?.name, total, notes: notes?.trim(),
        shareUrl:   share ? `${baseUrl}/share/co/${share.token}` : null,
        portalUrl:  signers ? `${baseUrl}/portal/projects/${params.id}` : null,
        senderName: user.name || user.email,
      }),
    },
  });
}
