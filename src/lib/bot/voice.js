/**
 * Who an email is from and how they sound (Mike 9-26): their details for the
 * signature, the company signature layout, their tone profile and a few of
 * their real emails. Every email writer calls senderVoice().
 *
 * Server only. Never throws: a failed lookup costs the voice, not the email.
 */
import { prisma } from '@/lib/db';
import { DEFAULT_SIGNATURE_TEMPLATE } from '@/lib/bot/emailStyle';
import { voiceSamplesFor } from '@/lib/tone/library';

export async function signatureTemplate() {
  try {
    const row = await prisma.emailSignatureTemplate.findUnique({ where: { id: 'company' } });
    return row?.template?.trim() ? row.template : DEFAULT_SIGNATURE_TEMPLATE;
  } catch (e) {
    console.error('[voice] signature template lookup failed:', e?.message ?? e);
    return DEFAULT_SIGNATURE_TEMPLATE;
  }
}

/** The sender with .signatureTemplate and .samples attached, or null. */
export async function senderVoice(userId, { samples = 4 } = {}) {
  if (!userId) return null;
  try {
    const [user, template, examples] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, jobTitle: true, phone: true, signatureName: true, officePhone: true, officeExt: true, toneProfile: true } }),
      signatureTemplate(),
      samples ? voiceSamplesFor(userId, samples) : [],
    ]);
    return user ? { ...user, signatureTemplate: template, samples: examples } : null;
  } catch (e) {
    console.error('[voice] sender lookup failed:', e?.message ?? e);
    return null;
  }
}
