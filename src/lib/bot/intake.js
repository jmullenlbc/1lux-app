/**
 * intake.js — the app side of email/calendar sync.
 *
 * This is the stable boundary the Microsoft 365 sync (Graph webhooks / delta
 * polling) will call once it's connected. It also backs the Test panel and the
 * intake API, so the whole pipeline is exercisable today without M365: a raw
 * provider payload is normalized into the engine's field shape, the owner +
 * contact are resolved, and the matching trigger is fired.
 */
import { prisma } from '@/lib/db';
import { runTrigger } from '@/lib/bot/ruleEngine';

const ACTIVITY_KEYWORDS = [
  [/\bcoffee\b/i, 'COFFEE'], [/\blunch\b|\bdinner\b/i, 'LUNCH'], [/\bgolf\b/i, 'GOLF'],
  [/\bhappy hour\b|\bdrinks\b/i, 'HAPPY_HOUR'], [/\bsite visit\b|\bwalk ?through\b/i, 'SITE_VISIT'],
  [/\bcall\b|\bzoom\b|\bteams\b|\bphone\b/i, 'CALL'],
];
function guessActivityType(title = '') {
  for (const [re, t] of ACTIVITY_KEYWORDS) if (re.test(title)) return t;
  return 'OTHER';
}

// Resolve the ILC owner of an inbound item (the mailbox/organizer), by email.
async function resolveOwner({ ownerUserId, ownerEmail }) {
  if (ownerUserId) return ownerUserId;
  if (ownerEmail) {
    const u = await prisma.user.findFirst({ where: { email: ownerEmail }, select: { id: true } }).catch(() => null);
    if (u) return u.id;
  }
  return null;
}

// Resolve a CRM contact by email (so DRAFT_EMAIL can address a reply).
async function resolveContactByEmail(email) {
  if (!email) return null;
  return prisma.contact.findFirst({
    where: { email }, select: { id: true, name: true, email: true, company: true },
  }).catch(() => null);
}

// ── Email ────────────────────────────────────────────────────────────────────
export function normalizeEmail(raw = {}) {
  const fromEmail = (raw.fromEmail || raw.from || '').toLowerCase().trim();
  return {
    fromEmail,
    fromDomain: fromEmail.includes('@') ? fromEmail.split('@')[1] : '',
    subject: raw.subject || '',
    body: raw.body || raw.bodyPreview || '',
  };
}

export async function ingestEmail(raw, opts = {}) {
  const payload = normalizeEmail(raw);
  const [ownerUserId, contact] = await Promise.all([
    resolveOwner({ ownerUserId: opts.ownerUserId, ownerEmail: raw.to || raw.mailbox || opts.ownerEmail }),
    resolveContactByEmail(payload.fromEmail),
  ]);
  return runTrigger('EMAIL_RECEIVED', payload, {
    ownerUserId, contact, eventRef: raw.messageId || raw.id || null, dryRun: opts.dryRun,
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────────
export function normalizeCalendarEvent(raw = {}) {
  const attendees = Array.isArray(raw.attendees) ? raw.attendees : [];
  const title = raw.title || raw.subject || '';
  return {
    title,
    activityType: raw.activityType || guessActivityType(title),
    attendeeCount: attendees.length,
    isInPerson: raw.isInPerson ?? !/zoom|teams|virtual|http/i.test(raw.location || ''),
  };
}

export async function ingestCalendarEvent(raw, opts = {}) {
  const payload = normalizeCalendarEvent(raw);
  const organizerEmail = (raw.organizerEmail || raw.organizer || '').toLowerCase().trim();
  const ownerUserId = await resolveOwner({ ownerUserId: opts.ownerUserId, ownerEmail: organizerEmail || opts.ownerEmail });
  return runTrigger('CALENDAR_EVENT_CREATED', payload, {
    ownerUserId, eventRef: raw.eventId || raw.id || null, dryRun: opts.dryRun,
  });
}
