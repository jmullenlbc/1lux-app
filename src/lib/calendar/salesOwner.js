/**
 * Who owns a meeting the calendar sync turns into a draft note, and whether a
 * hand-made note's calendar link points at a synced event. Pure — no database.
 *
 * Owner (Mike 9-25): the ILC person on the invite who is tagged Sales +
 * marketing. A client who sends the invite is never the owner, so the draft
 * still lands in a salesperson's "Mine to publish" list.
 */
import { SALES_MARKETING } from '../departments.js';

const lower = s => String(s || '').trim().toLowerCase();

/** The invite's addresses in the order that decides ownership: mailbox, organizer, guests. */
export function inviteEmails(event = {}, mailbox = '') {
  const out = [mailbox, event.organizerEmail, ...(event.attendees || []).map(a => a?.email)]
    .map(lower).filter(Boolean);
  return [...new Set(out)];
}

/**
 * @param users [{ id, email, departments: [{ department }] }] — any users; only
 *              ones whose email is on the invite count.
 * @returns the owner's user id, or null. A salesperson wins; failing that, the
 *          first ILC user on the invite (the old organizer rule).
 */
export function pickSalesOwner(event, users = [], { mailbox = '' } = {}) {
  const byEmail = new Map(users.filter(u => u?.email).map(u => [lower(u.email), u]));
  const onInvite = inviteEmails(event, mailbox).map(e => byEmail.get(e)).filter(Boolean);
  const isSales = u => (u.departments || []).some(d => d.department === SALES_MARKETING);
  return (onInvite.find(isSales) || onInvite[0])?.id ?? null;
}

/**
 * Every owner of a synced meeting (0108, Mike 9-27): each salesperson on the
 * invite, mailbox first. No salesperson: the first ILC user, as above.
 */
export function pickSalesOwners(event, users = [], { mailbox = '' } = {}) {
  const byEmail = new Map(users.filter(u => u?.email).map(u => [lower(u.email), u]));
  const onInvite = inviteEmails(event, mailbox).map(e => byEmail.get(e)).filter(Boolean);
  const isSales = u => (u.departments || []).some(d => d.department === SALES_MARKETING);
  const sales = onInvite.filter(isSales).map(u => u.id);
  return [...new Set(sales.length ? sales : onInvite.slice(0, 1).map(u => u.id))];
}

/** The event id inside an Outlook link (?itemid=… or …/item/<id>), or null. */
export function eventIdFromLink(link) {
  let url;
  try { url = new URL(String(link || '').trim()); } catch { return null; }
  const q = url.searchParams.get('itemid') || url.searchParams.get('itemId');
  if (q) return q;
  const m = url.pathname.match(/\/item\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Does a pasted calendar link point at this synced event? */
export function linkMatchesEvent(link, event = {}) {
  const l = String(link || '').trim();
  if (!l) return false;
  if (event.webUrl && l === String(event.webUrl).trim()) return true;
  const id = eventIdFromLink(l);
  return Boolean(id && (id === event.externalId || id === event.iCalUid));
}

/**
 * A calendar link as typed or pasted into a note: http(s) only, trimmed, or
 * null. Anything else (a javascript: link, plain words) is refused rather
 * than saved, since the note shows it as a clickable "Open in calendar".
 */
export function cleanCalendarLink(link) {
  const s = String(link || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && s.length <= 2000 ? s : undefined;
  } catch { return undefined; }
}
