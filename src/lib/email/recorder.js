/**
 * Saving an email and keeping each person's two Last Email dates true.
 *
 * The flow, end to end:
 *   1. A provider message arrives (Microsoft Graph, or a test fixture).
 *   2. normalize.js turns it into the neutral shape.
 *   3. classify.js decides whether it counts as real contact.
 *   4. This file saves it, links the people on it, and refreshes their dates.
 *
 * Two rules worth knowing:
 *
 *  - EVERY message is stored, even the ones that do not count. Only the two
 *    dates are filtered. If we threw away mass sends we could never change our
 *    minds about a rule without re-syncing the whole mailbox.
 *
 *  - The message's own external id is unique, so a re-sync updates rather than
 *    duplicates. Running the same sync twice is safe.
 */
import { classifyEmail, normalizeAddress } from './classify.js';
import { toAddressJson } from './normalize.js';
import { getMassEmailThreshold } from './settings.js';

/**
 * Who on this email is one of our people, and in what capacity.
 *
 * `contactsByEmail` is a plain map of lowercased address → contact id. The role
 * is what separates the two Last Email fields: FROM means they wrote to us,
 * anything else means we wrote to them.
 *
 * A person appearing twice (To and Cc, say) gets one row — the FROM role wins,
 * then To, then Cc, then Bcc.
 */
export function contactRolesForMessage(message, contactsByEmail = {}) {
  const ranked = [
    ['FROM', [message?.from]],
    ['TO',   message?.to  || []],
    ['CC',   message?.cc  || []],
    ['BCC',  message?.bcc || []],
  ];

  const seen = new Map();   // contactId → role
  for (const [role, addresses] of ranked) {
    for (const address of addresses) {
      const key = normalizeAddress(address);
      if (!key) continue;
      const contactId = contactsByEmail[key];
      if (!contactId || seen.has(contactId)) continue;
      seen.set(contactId, role);
    }
  }
  return [...seen].map(([contactId, role]) => ({ contactId, role }));
}

/** Every address on the message, so we can look them all up in one query. */
export function addressesOnMessage(message) {
  const all = [message?.from, ...(message?.to || []), ...(message?.cc || []), ...(message?.bcc || [])];
  return [...new Set(all.map(normalizeAddress).filter(Boolean))];
}

/**
 * Rebuild one person's two Last Email dates from the emails they are linked to.
 *
 * Received = the newest counting email they SENT us.
 * Sent     = the newest counting email they were a recipient of.
 *
 * Derived from the links every time rather than nudged forward on write, so a
 * date can go BACKWARDS when a message is deleted or a rule changes — a stored
 * high-water mark could never do that.
 */
export async function refreshContactEmailDates(prisma, contactId) {
  const newest = async roles => {
    const link = await prisma.emailContactLink.findFirst({
      where:   { contactId, role: { in: roles }, message: { countsAsContact: true } },
      orderBy: { message: { sentAt: 'desc' } },
      select:  { message: { select: { sentAt: true } } },
    });
    return link?.message?.sentAt ?? null;
  };

  const [lastEmailReceivedAt, lastEmailSentAt] = await Promise.all([
    newest(['FROM']),
    newest(['TO', 'CC', 'BCC']),
  ]);

  await prisma.contact.update({
    where: { id: contactId },
    data:  { lastEmailReceivedAt, lastEmailSentAt },
  });

  return { lastEmailReceivedAt, lastEmailSentAt };
}

/**
 * Save one neutral message, link our people to it, and refresh their dates.
 *
 * Returns { messageId, counts, reasons, linkedContactIds }.
 * `accountId` is the EmailAccount row the message was synced from.
 *
 * `massEmailMinPeople` can be passed in when a caller is looping over a batch
 * and has already looked the number up; otherwise it is read from Mike's rule.
 */
export async function recordEmailMessage(
  prisma,
  message,
  { accountId, projectId = null, massEmailMinPeople } = {},
) {
  if (!message?.externalId) throw new Error('recordEmailMessage: the message has no external id');
  if (!accountId)           throw new Error('recordEmailMessage: no email account given');

  const minPeople = massEmailMinPeople ?? await getMassEmailThreshold(prisma);
  const verdict = classifyEmail(message, { massEmailMinPeople: minPeople });

  const fields = {
    accountId,
    projectId,
    conversationId:    message.conversationId || message.externalId,
    subject:           message.subject || '',
    bodyPreview:       message.bodyPreview ?? null,
    bodyHtml:          message.bodyHtml ?? null,
    fromEmail:         normalizeAddress(message.from),
    fromName:          message.fromName ?? null,
    toEmails:          toAddressJson(message.to),
    ccEmails:          toAddressJson(message.cc),
    bccEmails:         toAddressJson(message.bcc),
    sentAt:            message.sentAt ? new Date(message.sentAt) : new Date(),
    receivedAt:        new Date(message.receivedAt || message.sentAt || Date.now()),
    isRead:            Boolean(message.isRead),
    hasAttachments:    Boolean(message.hasAttachments),
    internetMessageId: message.internetMessageId ?? null,
    inReplyTo:         message.inReplyTo ?? null,
    webUrl:            message.webUrl ?? null,
    peopleCount:       verdict.people,
    isMassEmail:       verdict.massEmail,
    isCalendarInvite:  verdict.calendarInvite,
    isReplyMessage:    verdict.reply,
    isAutomated:       verdict.automated,
    countsAsContact:   verdict.counts,
  };

  // A re-sync updates the row it already wrote instead of making a second one.
  const saved = await prisma.emailMessage.upsert({
    where:  { externalId: message.externalId },
    create: { externalId: message.externalId, ...fields },
    update: fields,
    select: { id: true },
  });

  // Match the addresses on the email to people we know. Case-insensitive by
  // storing the comparison in JS: Prisma's `mode: 'insensitive'` is Postgres
  // only and this codebase also runs on SQLite locally.
  const addresses = addressesOnMessage(message);
  const known = addresses.length
    ? await prisma.contact.findMany({
        where:  { email: { not: null } },
        select: { id: true, email: true },
      })
    : [];

  const contactsByEmail = {};
  for (const c of known) {
    const key = normalizeAddress(c.email);
    if (key && addresses.includes(key)) contactsByEmail[key] = c.id;
  }

  const roles = contactRolesForMessage(message, contactsByEmail);

  for (const { contactId, role } of roles) {
    await prisma.emailContactLink.upsert({
      where:  { messageId_contactId: { messageId: saved.id, contactId } },
      create: { messageId: saved.id, contactId, role },
      update: { role },
    });
  }

  for (const { contactId } of roles) {
    await refreshContactEmailDates(prisma, contactId);
  }

  return {
    messageId:        saved.id,
    counts:           verdict.counts,
    reasons:          verdict.reasons,
    minPeople,
    linkedContactIds: roles.map(r => r.contactId),
  };
}
