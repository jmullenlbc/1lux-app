import { NextResponse } from 'next/server';
import { requireAuth, actsAsAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

function canModify(user, rule) {
  if (actsAsAdmin(user)) return true;
  return rule.userId === user.id;
}

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = params;

  const existing = await prisma.schedulingRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Scheduling rule not found' }, { status: 404 });
  }

  if (!canModify(user, existing)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const {
    meetingType,
    dealStage,
    preferredDaysOfWeek,
    preferredStartTime,
    preferredEndTime,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    durationMinutes,
    locationType,
    homeBase,
    travelCity,
    travelBufferMinutes,
    priority,
    isCompanyDefault,
  } = body;

  const updated = await prisma.schedulingRule.update({
    where: { id },
    data: {
      ...(meetingType !== undefined && { meetingType }),
      ...(dealStage !== undefined && { dealStage }),
      ...(preferredDaysOfWeek !== undefined && { preferredDaysOfWeek }),
      ...(preferredStartTime !== undefined && { preferredStartTime }),
      ...(preferredEndTime !== undefined && { preferredEndTime }),
      ...(bufferBeforeMinutes !== undefined && { bufferBeforeMinutes }),
      ...(bufferAfterMinutes !== undefined && { bufferAfterMinutes }),
      ...(durationMinutes !== undefined && { durationMinutes }),
      ...(locationType !== undefined && { locationType }),
      ...(homeBase !== undefined && { homeBase }),
      ...(travelCity !== undefined && { travelCity }),
      ...(travelBufferMinutes !== undefined && { travelBufferMinutes }),
      ...(priority !== undefined && { priority }),
      ...(isCompanyDefault !== undefined && { isCompanyDefault }),
    },
  });

  return NextResponse.json({ rule: updated });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = params;

  const existing = await prisma.schedulingRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Scheduling rule not found' }, { status: 404 });
  }

  if (!canModify(user, existing)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.schedulingRule.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
