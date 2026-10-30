// The public side of a campaign email (0147): open pixel, clicks, unsubscribe.
// Everything is found by the send's token; nothing here needs a sign in.
import { prisma } from '@/lib/db';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export async function sendByToken(token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  return prisma.campaignSend.findUnique({ where: { token } });
}

/** Opens are a soft signal: Apple Mail loads every image on its own. */
export async function recordOpen(send) {
  await prisma.campaignSend.update({
    where: { id: send.id },
    data: { openCount: { increment: 1 }, ...(send.openedAt ? {} : { openedAt: new Date() }) },
  });
}

export async function recordClick(send, blockId, ipHash) {
  const now = new Date();
  await prisma.$transaction([
    prisma.campaignClick.create({ data: { sendId: send.id, blockId, ipHash } }),
    prisma.campaignSend.update({
      where: { id: send.id },
      data: {
        clickCount: { increment: 1 },
        ...(send.firstClickAt ? {} : { firstClickAt: now }),
        // A click means it was opened, even with pictures turned off.
        ...(send.openedAt ? {} : { openedAt: now }),
      },
    }),
  ]);
}

/** Puts the address on the do-not-email list for every campaign. Safe to call twice. */
export async function unsubscribe(send) {
  const now = new Date();
  await prisma.$transaction([
    prisma.campaignSuppression.upsert({
      where: { email: send.email },
      create: { email: send.email, reason: 'UNSUBSCRIBE', contactId: send.contactId, campaignId: send.campaignId },
      update: { reason: 'UNSUBSCRIBE', liftedAt: null, liftedById: null, campaignId: send.campaignId },
    }),
    prisma.campaignSend.update({ where: { id: send.id }, data: send.unsubscribedAt ? {} : { unsubscribedAt: now } }),
  ]);
}
