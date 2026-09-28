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
import { normalizeEvent } from '@/lib/calendar/normalize';
import { classifyEvent } from '@/lib/bot/activityClassifier';
import { recordCalendarEvent } from '@/lib/calendar/recorder';
import { notAcceptedReason } from '@/lib/calendar/worthANote';
import { pickSalesOwners } from '@/lib/calendar/salesOwner';

// The owners of a synced meeting are the salespeople on the invite (Mike 9-25,
// every one of them since 0108). The first is the note's creator.
// Emails are compared in JS: Prisma's case-insensitive match is Postgres-only.
async function resolveCalendarOwners(event, opts) {
  if (opts.ownerUserId) return [opts.ownerUserId];
  const users = await prisma.user.findMany({
    select: { id: true, email: true, departments: { select: { department: true } } },
  }).catch(() => []);
  return pickSalesOwners(event, users, { mailbox: opts.mailboxAddress || opts.ownerEmail || '' });
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

/**
 * A raw event → the fields the automation rules read.
 *
 * The heavy lifting moved out of here: src/lib/calendar/normalize.js speaks
 * Microsoft, and src/lib/calendar/inPerson.js decides in person vs not from the
 * title and the location. This function now just names what a rule can test.
 *
 * `classification` is optional — pass it when you have already classified the
 * event so it is not worked out twice.
 */
export function normalizeCalendarEvent(raw = {}, classification = null) {
  const event = raw?.attendeeCount !== undefined && raw?.startAt !== undefined
    ? raw                       // already neutral
    : normalizeEvent(raw);

  return {
    title:          event.title,
    location:       event.location || '',
    activityType:   raw.activityType || classification?.activityType || null,
    attendeeCount:  event.attendeeCount,
    organizerEmail: event.organizerEmail || '',
    isInPerson:     raw.isInPerson ?? Boolean(classification?.isInPerson),
  };
}

/**
 * The door the Microsoft 365 calendar sync knocks on.
 *
 * What happens to one event, in order:
 *   1. It is turned into the neutral shape (Graph or anything else).
 *   2. It is classified — your rules first, then the title and location
 *      keywords, then the AI. This is Mike's "know it's in person through a
 *      title or location", 2026-09-07.
 *   3. It becomes a DRAFT sales note, unless it classified as not worth one.
 *      Publishing the note is still a person's decision, and publishing is what
 *      sets off the AI action items, the bot drafts and the Last In Person date.
 *   4. The CALENDAR_EVENT_CREATED trigger fires, so any rule Mike built on the
 *      automation screen runs — but only when the sales person ACCEPTED the
 *      invite (Mike 9-19: "it should only trigger when the sales person has
 *      accepted that invite"). Declined, unanswered and tentative invites
 *      write no note and fire no rule; the owner's own events and events
 *      with no response field (.ics files) pass.
 *
 * `dryRun` classifies and fires the trigger in preview mode but writes no note,
 * which is what the Test panel wants.
 */
export async function ingestCalendarEvent(raw, opts = {}) {
  const event = normalizeEvent(raw, {
    format:         opts.format || 'auto',
    mailboxAddress: opts.mailboxAddress || opts.ownerEmail || '',
  });

  const [ownerUserIds, classification] = await Promise.all([
    resolveCalendarOwners(event, opts),
    classifyEvent(event),
  ]);
  const ownerUserId = ownerUserIds[0] || null;

  let note = { noteId: null, status: 'skipped', reason: 'dry run — no note written' };
  if (!opts.dryRun && opts.createNote !== false) {
    try {
      note = await recordCalendarEvent(prisma, event, {
        ownerUserId,
        ownerUserIds,
        classification,
        projectId: opts.projectId ?? null,
      });
    } catch (err) {
      // A note that fails to save must not cost us the trigger run.
      console.error('[intake] could not write the calendar note:', err?.message ?? err);
      note = { noteId: null, status: 'skipped', reason: `note not saved: ${err?.message ?? 'unknown error'}` };
    }
  }

  // Mike 9-19: no rule runs for an invite the sales person has not accepted.
  const notAccepted = notAcceptedReason(event);
  if (notAccepted) {
    return { triggerType: 'CALENDAR_EVENT_CREATED', dryRun: !!opts.dryRun, baseline: null, fired: [], matched: [], ruleCount: 0,
             skipped: true, reason: `not accepted — ${notAccepted}`, classification, note };
  }

  const payload = normalizeCalendarEvent(event, classification);
  const result = await runTrigger('CALENDAR_EVENT_CREATED', payload, {
    ownerUserId, eventRef: event.externalId, dryRun: opts.dryRun,
  });

  return { ...result, classification, note };
}
