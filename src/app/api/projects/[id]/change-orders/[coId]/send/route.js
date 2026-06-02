import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProjectRates, calcCOTotal } from '@/lib/changeOrderRates';
import { getAnthropicKey } from '@/lib/anthropicKey'; // unused but ensures env is loaded

const CO_INCLUDE = {
  optionGroups: {
    orderBy: { sortOrder: 'asc' },
    include: { lineItems: { orderBy: [{ sortOrder: 'asc' }] } },
  },
  createdBy: { select: { name: true, email: true } },
};

// POST /api/projects/[id]/change-orders/[coId]/send
// Body: { recipients: string (comma-sep), notes?: string }
// Creates ChangeOrderSend record, sends email, transitions DRAFT → SENT
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({
    where:   { id: params.coId },
    include: CO_INCLUDE,
  });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'CO is already approved' }, { status: 400 });

  const selected = co.optionGroups.find(g => g.isSelected);
  if (!selected) return NextResponse.json({ error: 'No option group selected — select one before sending' }, { status: 400 });

  const body  = await req.json().catch(() => ({}));
  const { recipients, notes } = body;
  if (!recipients?.trim()) return NextResponse.json({ error: 'recipients required' }, { status: 400 });

  const project = await prisma.project.findUnique({
    where:  { id: params.id },
    select: { name: true, address: true, city: true, state: true },
  });
  const rates  = await getProjectRates(params.id);
  const total  = calcCOTotal(co, rates);
  const pdfUrl = `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/projects/${params.id}/change-orders/${params.coId}/pdf`;

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
    ...(co.status === 'DRAFT'
      ? [prisma.changeOrder.update({ where: { id: params.coId }, data: { status: 'SENT' } })]
      : []),
  ]);

  // Send email via notification system (best-effort, don't fail the request)
  try {
    const { sendNotification } = await import('@/lib/notify');
    const recipientList = recipients.split(',').map(e => e.trim()).filter(Boolean);
    for (const to of recipientList) {
      await sendNotification({
        to,
        subject: `Change Order ${co.coNumber}: ${co.title} — ${project?.name || ''}`,
        html: `
          <p>Please find attached change order <strong>${co.coNumber}</strong>: ${co.title}</p>
          ${notes ? `<p><em>${notes}</em></p>` : ''}
          <p><strong>Total: $${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
          <p><a href="${pdfUrl}" style="background:#0f172a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View Change Order PDF</a></p>
          <hr/>
          <p style="color:#888;font-size:12px;">Sent by ${user.name || user.email} · ILC Studios</p>
        `,
      }).catch(() => {});
    }
  } catch {}

  // Re-fetch updated CO
  const updated = await prisma.changeOrder.findUnique({
    where: { id: params.coId },
    include: {
      ...CO_INCLUDE,
      sends:  { orderBy: { sentAt: 'desc' }, include: { sentBy: { select: { name: true, email: true } } } },
      shares: { select: { token: true, createdAt: true } },
    },
  });

  return NextResponse.json({ co: { ...updated, totalValue: calcCOTotal(updated, rates), rates }, send });
}
