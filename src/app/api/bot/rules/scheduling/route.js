import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const rules = await prisma.schedulingRule.findMany({
    where: {
      OR: [
        { userId: user.id },
        { userId: null },
      ],
    },
    orderBy: { priority: 'asc' },
  });

  return NextResponse.json({ rules });
}

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

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

  const adminRoles = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN'];
  const isAdmin = adminRoles.includes(user.role);

  // Company defaults can only be set by admins; fall back to user-scoped
  const ownerId = isCompanyDefault && isAdmin ? null : user.id;

  const rule = await prisma.schedulingRule.create({
    data: {
      userId: ownerId,
      meetingType: meetingType ?? null,
      dealStage: dealStage ?? null,
      preferredDaysOfWeek: preferredDaysOfWeek ?? null,
      preferredStartTime: preferredStartTime ?? null,
      preferredEndTime: preferredEndTime ?? null,
      bufferBeforeMinutes: bufferBeforeMinutes ?? null,
      bufferAfterMinutes: bufferAfterMinutes ?? null,
      durationMinutes: durationMinutes ?? null,
      locationType: locationType ?? null,
      homeBase: homeBase ?? null,
      travelCity: travelCity ?? null,
      travelBufferMinutes: travelBufferMinutes ?? null,
      priority: priority ?? 0,
      isCompanyDefault: isCompanyDefault ?? false,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}
