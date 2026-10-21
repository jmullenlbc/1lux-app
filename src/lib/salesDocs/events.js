// Sales Docs events that reach a person (0137). Alerts go to the bell through
// notifyUser, never email (sending is not live). Phase 2 hangs follow-up
// tasks and bot rules off onSalesDocEvent.
import { notifyUser } from '../alerts.js';

const who = (visitor) => visitor?.email || 'Someone';

export async function onSalesDocEvent(type, { link, visitor, docTitle, viewId } = {}, { db } = {}) {
  if (!link?.createdById) return { created: false, reason: 'no owner' };
  const href = link.docId ? `/sales/docs/${link.docId}` : link.spaceId ? `/sales/docs/spaces/${link.spaceId}` : '/sales/docs/links';

  if (type === 'OPENED') {
    if (!link.notifyOnFirstOpen) return { created: false, reason: 'off' };
    return notifyUser({
      userId: link.createdById,
      type: 'SALES_DOC_OPENED',
      title: `${who(visitor)} opened ${docTitle || link.name}`,
      message: `Link: ${link.name}`,
      link: href,
      dedupeKey: `sdopen:${link.id}`,
    }, { db });
  }

  if (type === 'FORWARDED') {
    return notifyUser({
      userId: link.createdById,
      type: 'SALES_DOC_FORWARDED',
      title: `${docTitle || link.name} was forwarded to ${who(visitor)}`,
      message: link.recipientEmail ? `Sent to ${link.recipientEmail}` : `Link: ${link.name}`,
      link: href,
      dedupeKey: `sdfwd:${link.id}:${visitor?.id || viewId || 'x'}`,
    }, { db });
  }
  return { created: false, reason: 'no alert for this event' };
}
