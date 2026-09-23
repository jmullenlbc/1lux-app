import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NOTIFICATION_TYPES } from '@/lib/notify';
import { isVerdict, shouldOfferMute, muteQuestion, STRIKES_BEFORE_ASKING } from '@/lib/alertFeedback';

// POST /api/alerts/feedback — "Useful" or "Don't need" on one notification.
// Body: { alertId, verdict: 'USEFUL' | 'NOT_USEFUL' }
//
// Replies with `offerMute` when this is the third "Don't need" on the same kind,
// which is the app asking the question rather than deciding for them.
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  if (!isVerdict(body.verdict)) {
    return NextResponse.json({ error: "verdict must be 'USEFUL' or 'NOT_USEFUL'" }, { status: 400 });
  }

  // The alert has to be one of theirs — otherwise anyone could rate anyone's.
  const alert = await prisma.userAlert.findFirst({
    where:  { id: body.alertId || '', userId: user.id },
    select: { id: true, type: true },
  });
  if (!alert) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

  const alertType = alert.type || 'GENERAL';

  // One verdict per person per alert: clicking the other button changes the
  // answer rather than stacking a second row on top of the first.
  const existing = await prisma.alertFeedback.findFirst({
    where:  { userId: user.id, alertId: alert.id },
    select: { id: true },
  });
  if (existing) {
    await prisma.alertFeedback.update({ where: { id: existing.id }, data: { verdict: body.verdict } });
  } else {
    await prisma.alertFeedback.create({
      data: { userId: user.id, alertId: alert.id, alertType, verdict: body.verdict },
    });
  }

  const [notUsefulCount, muted] = await Promise.all([
    prisma.alertFeedback.count({ where: { userId: user.id, alertType, verdict: 'NOT_USEFUL' } }),
    prisma.alertMute.findUnique({ where: { userId_alertType: { userId: user.id, alertType } }, select: { id: true } }),
  ]);

  const offer = body.verdict === 'NOT_USEFUL'
    && shouldOfferMute({ notUsefulCount, alreadyMuted: !!muted });

  const label = NOTIFICATION_TYPES[alertType]?.label || alertType;

  return NextResponse.json({
    ok: true,
    verdict:        body.verdict,
    alertType,
    notUsefulCount,
    offerMute:      offer,
    muteQuestion:   offer ? muteQuestion(label) : null,
    strikes:        STRIKES_BEFORE_ASKING,
  });
}
