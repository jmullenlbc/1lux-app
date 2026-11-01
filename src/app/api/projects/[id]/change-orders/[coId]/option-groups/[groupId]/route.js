import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseLooseNumber } from '@/lib/numberInput';

const refuse = (message, code) => NextResponse.json({ error: `${message} Nothing was saved. Fix the number and try again. (${code})`, code }, { status: 400 });

// Discount from the footer box: dollars or a percent typed as 0 to 100, never both.
function readDiscount(body) {
  const out = {};
  if (body.discountNote !== undefined) out.discountNote = String(body.discountNote || '').trim() || null;
  if (body.discountAmount === undefined && body.discountPercent === undefined) return { out };
  const amount = parseLooseNumber(body.discountAmount);
  const percent = parseLooseNumber(body.discountPercent);
  if (Number.isNaN(amount) || Number.isNaN(percent)) return { fail: refuse('That discount is not a number.', 'CO_DISCOUNT_NOT_A_NUMBER') };
  if (amount != null && amount < 0) return { fail: refuse('A discount cannot be below zero. Use a negative line for a credit.', 'CO_DISCOUNT_NEGATIVE') };
  if (percent != null && (percent < 0 || percent > 100)) return { fail: refuse('A discount percent has to be between 0 and 100.', 'CO_DISCOUNT_PERCENT_RANGE') };
  out.discountPct = percent != null ? percent / 100 : null;
  out.discountAmount = percent != null ? null : (amount ?? null);
  return { out };
}

// Freight or warehousing from the footer box: dollars or a percent typed as 0
// to 100. An empty box goes back to the job's rate, a typed 0 waives it.
function readFee(body, key, label) {
  const amountKey = `${key}Override`;
  const percentKey = `${key}OverridePercent`;
  if (body[amountKey] === undefined && body[percentKey] === undefined) return { out: {} };
  const amount = parseLooseNumber(body[amountKey]);
  const percent = parseLooseNumber(body[percentKey]);
  if (Number.isNaN(amount) || Number.isNaN(percent)) return { fail: refuse(`That ${key} figure is not a number.`, 'CO_FEE_NOT_A_NUMBER') };
  if (amount != null && amount < 0) return { fail: refuse(`${label} dollars cannot be below zero.`, 'CO_FEE_NEGATIVE') };
  if (percent != null && (percent < 0 || percent > 100)) return { fail: refuse(`A ${key} percent has to be between 0 and 100.`, 'CO_FEE_PERCENT_RANGE') };
  return { out: { [`${key}OverridePct`]: percent != null ? percent / 100 : null, [amountKey]: percent != null ? null : (amount ?? null) } };
}

// PATCH /api/projects/[id]/change-orders/[coId]/option-groups/[groupId]
// Update label, discount, freight, warehousing, or set as selected (enforces single-selection in transaction)
export async function PATCH(req, { params }) {
  const { error } = await requirePermission(req, 'editJobMoney'); // Construction, Operations, Finance, admins
  if (error) return error;

  const group = await prisma.changeOrderOptionGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.changeOrderId !== params.coId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const co = await prisma.changeOrder.findUnique({ where: { id: params.coId } });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'This change order is approved and locked. Nothing was changed. An admin can undo the approval.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { label, isSelected } = body;
  const { out: discount, fail } = readDiscount(body);
  if (fail) return fail;
  const freight = readFee(body, 'freight', 'Freight');
  if (freight.fail) return freight.fail;
  const warehousing = readFee(body, 'warehousing', 'Warehousing');
  if (warehousing.fail) return warehousing.fail;
  const money = { ...discount, ...freight.out, ...warehousing.out };

  if (isSelected === true) {
    // Transaction: deselect all others, select this one
    await prisma.$transaction([
      prisma.changeOrderOptionGroup.updateMany({
        where: { changeOrderId: params.coId },
        data:  { isSelected: false },
      }),
      prisma.changeOrderOptionGroup.update({
        where: { id: params.groupId },
        data:  { isSelected: true, ...(label != null && { label }), ...money },
      }),
    ]);
  } else {
    await prisma.changeOrderOptionGroup.update({
      where: { id: params.groupId },
      data: {
        ...(label      != null && { label }),
        ...(isSelected != null && { isSelected }),
        ...money,
      },
    });
  }

  const updated = await prisma.changeOrderOptionGroup.findUnique({
    where: { id: params.groupId },
    include: { lineItems: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  });
  return NextResponse.json(updated);
}

// DELETE /api/projects/[id]/change-orders/[coId]/option-groups/[groupId]
// Must keep at least one group
export async function DELETE(req, { params }) {
  const { error } = await requirePermission(req, 'editJobMoney'); // Construction, Operations, Finance, admins
  if (error) return error;

  const co = await prisma.changeOrder.findUnique({
    where: { id: params.coId },
    include: { optionGroups: { select: { id: true } } },
  });
  if (!co || co.projectId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (co.status === 'APPROVED') return NextResponse.json({ error: 'This change order is approved and locked. Nothing was changed. An admin can undo the approval.' }, { status: 403 });
  if (co.optionGroups.length <= 1) return NextResponse.json({ error: 'Cannot delete the last option group' }, { status: 400 });

  await prisma.changeOrderOptionGroup.delete({ where: { id: params.groupId } });
  return NextResponse.json({ ok: true });
}
