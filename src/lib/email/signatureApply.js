/**
 * What an email signature says about the person who wrote it, applied to their
 * CRM card (Mike, 2026-10-05): fill blanks only, never overwrite. When what we
 * have differs, make a question (ContactFieldSuggestion) for a person to
 * answer. Never fails the recording.
 *
 * Relative imports only, so the tests can load this with a fake database.
 */
import { parseSignature } from './signature.js';

/** Signature field -> Contact column. website has no Contact column, so it is a question only. */
export const FIELD_TO_COLUMN = {
  phone:       'workPhone',
  mobile:      'cellPhone',
  title:       'title',
  company:     'company',
  linkedInUrl: 'linkedInUrl',
};

const digits = v => String(v ?? '').replace(/\D/g, '');
function sameValue(field, a, b) {
  if (field === 'phone' || field === 'mobile') return digits(a) === digits(b);
  const norm = v => String(v ?? '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return norm(a) === norm(b);
}

/**
 * @returns { filled: string[], suggested: string[] }
 */
export async function applySignatureToContact(prisma, { contactId, parsed, messageId = null }) {
  const result = { filled: [], suggested: [] };
  if (!prisma?.contact || !contactId || !parsed) return result;

  const contact = await prisma.contact.findUnique({
    where:  { id: contactId },
    select: { id: true, title: true, company: true, workPhone: true, cellPhone: true, phone: true, linkedInUrl: true },
  });
  if (!contact) return result;

  const fill = {};
  for (const [field, value] of Object.entries(parsed)) {
    if (!value || field === 'name') continue;
    const column = FIELD_TO_COLUMN[field];
    const current = column ? (contact[column] || (field === 'phone' ? contact.phone : null)) : null;

    if (column && !current) {
      fill[column] = value;
      if (column === 'workPhone' && !contact.phone) fill.phone = value; // legacy column kept in sync
      result.filled.push(field);
      continue;
    }
    if (column && sameValue(field, current, value)) continue;
    if (!prisma.contactFieldSuggestion) continue;

    // A difference is a question. The same question is never asked twice.
    const already = await prisma.contactFieldSuggestion.findFirst({
      where: { contactId, field, suggestedValue: value }, select: { id: true },
    });
    if (already) continue;
    await prisma.contactFieldSuggestion.create({
      data: { contactId, field, currentValue: current ?? null, suggestedValue: value, sourceMessageId: messageId },
    });
    result.suggested.push(field);
  }

  if (Object.keys(fill).length) await prisma.contact.update({ where: { id: contactId }, data: fill });
  return result;
}

/** Parse and apply in one go, for the recorder. Never throws. */
export async function applySignatureFromMessage(prisma, { contactId, message, messageId }) {
  try {
    // The neutral message carries bodyHtml and a 255 char preview; a plain
    // bodyText is used when a provider gives one.
    const parsed = parseSignature(message?.bodyText || '', {
      bodyHtml:   message?.bodyHtml || message?.bodyPreview || null,
      senderName: message?.fromName || null,
    });
    return await applySignatureToContact(prisma, { contactId, parsed, messageId });
  } catch (err) {
    console.error('[email] signature apply failed:', err?.message || err);
    return { filled: [], suggested: [] };
  }
}
