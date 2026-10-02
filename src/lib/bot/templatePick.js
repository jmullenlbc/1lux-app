import { prisma } from '@/lib/db';
import { bestTemplate } from '@/lib/bot/templateMatch';

export { templateSection } from '@/lib/bot/templateMatch';

/**
 * The closest active email template for a draft (templateMatch.js decides).
 * Every saved template counts, including the ones written from a person's own
 * emails on the Voice screen (scenario "custom"). A lookup that fails never
 * costs us the email: the writer drafts without a template.
 */
export async function pickTemplate(opts) {
  try {
    const list = await prisma.messageTemplate.findMany({ where: { channel: 'EMAIL', isActive: true }, orderBy: { createdAt: 'asc' } });
    return bestTemplate(list, opts);
  } catch (e) {
    console.error('[templatePick] lookup failed, drafting without a template:', e?.message ?? e);
    return null;
  }
}
