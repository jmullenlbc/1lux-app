/**
 * Turning a mail provider's message into the neutral shape the rules read.
 *
 * This is the ONE file that changes when the Microsoft mailbox is connected.
 * Everything downstream — the filters in classify.js, the recorder, the two
 * Last Email dates on a person — works off the neutral shape and never learns
 * that Microsoft exists.
 *
 * Two directions are supported:
 *   fromGraphMessage()  a live Microsoft Graph message  → neutral
 *   fromStoredMessage() a saved EmailMessage row        → neutral
 *
 * The second exists so we can re-run the rules over mail we already hold when a
 * rule changes, without asking Microsoft for it all over again.
 */

/** Graph writes addresses as { emailAddress: { address, name } }. */
function graphAddress(entry) {
  return entry?.emailAddress?.address || entry?.address || '';
}

function graphAddresses(list) {
  return (Array.isArray(list) ? list : []).map(graphAddress).filter(Boolean);
}

/** Graph hands headers back as a list of { name, value }; the rules want a map. */
function graphHeaders(list) {
  const out = {};
  for (const h of Array.isArray(list) ? list : []) {
    if (h?.name) out[String(h.name).toLowerCase()] = h.value;
  }
  return out;
}

/**
 * Graph message → neutral shape.
 *
 * `mailboxAddress` is the account we synced from. It decides direction: mail we
 * sent has our own mailbox in the From.
 */
export function fromGraphMessage(msg, mailboxAddress = '') {
  const from = graphAddress(msg?.from ?? msg?.sender);
  const mailbox = String(mailboxAddress || '').trim().toLowerCase();
  const isOurs = mailbox && from.toLowerCase() === mailbox;

  // Graph marks meeting requests, responses and cancellations with an OData type.
  const odataType = String(msg?.['@odata.type'] || '');

  return {
    externalId:        msg?.id || null,
    conversationId:    msg?.conversationId || null,
    conversationIndex: msg?.conversationIndex || null,
    direction:         isOurs ? 'OUTBOUND' : 'INBOUND',
    subject:           msg?.subject || '',
    bodyPreview:       msg?.bodyPreview || null,
    bodyHtml:          msg?.body?.content || null,
    from,
    fromName:          msg?.from?.emailAddress?.name || null,
    to:                graphAddresses(msg?.toRecipients),
    cc:                graphAddresses(msg?.ccRecipients),
    bcc:               graphAddresses(msg?.bccRecipients),
    sentAt:            msg?.sentDateTime || msg?.receivedDateTime || null,
    receivedAt:        msg?.receivedDateTime || msg?.sentDateTime || null,
    isRead:            Boolean(msg?.isRead),
    hasAttachments:    Boolean(msg?.hasAttachments),
    // Only present when the sync asks Graph to expand attachments. Names are
    // what "did they send the drawings?" reads (src/lib/followUp/watch.js).
    attachments:       (Array.isArray(msg?.attachments) ? msg.attachments : [])
      .filter(a => a?.name)
      .map(a => ({ filename: String(a.name).slice(0, 300), mimeType: a.contentType || null, size: Number(a.size) || 0 })),
    internetMessageId: msg?.internetMessageId || null,
    inReplyTo:         graphHeaders(msg?.internetMessageHeaders)['in-reply-to'] || null,
    isCalendarInvite:  /eventMessage/i.test(odataType),
    webUrl:            msg?.webLink || null,
    headers:           graphHeaders(msg?.internetMessageHeaders),
  };
}

/** The JSON-array address columns on EmailMessage hold [{ email, name }]. */
export function parseAddressList(value) {
  if (Array.isArray(value)) return value.map(e => (typeof e === 'string' ? e : e?.email)).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(e => (typeof e === 'string' ? e : e?.email)).filter(Boolean);
  } catch {
    return [];
  }
}

/** A saved EmailMessage row → neutral shape, so the rules can be re-run over it. */
export function fromStoredMessage(row) {
  return {
    externalId:        row?.externalId || null,
    conversationId:    row?.conversationId || null,
    subject:           row?.subject || '',
    from:              row?.fromEmail || '',
    to:                parseAddressList(row?.toEmails),
    cc:                parseAddressList(row?.ccEmails),
    bcc:               parseAddressList(row?.bccEmails),
    sentAt:            row?.sentAt || null,
    inReplyTo:         row?.inReplyTo || null,
    isCalendarInvite:  row?.isCalendarInvite === true,
    headers:           {},
  };
}

/** Neutral shape → the { email, name } JSON these columns already store. */
export function toAddressJson(addresses = []) {
  return JSON.stringify((addresses || []).filter(Boolean).map(email => ({ email, name: null })));
}
