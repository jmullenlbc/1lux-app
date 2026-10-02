/**
 * Check-in emails, the database half (Mike 9-26). Rules live in `./checkIns.js`.
 *
 * Each person due for a check-in gets ONE pre-written email, written the day
 * before, waiting in "Emails to review" on the salesperson's My Desk. Nothing
 * sends on its own: the draft stays PENDING_REVIEW until a person sends it.
 *
 * Whose desk: the person's owner, else the company's owner, else whoever last
 * wrote a sales note with them. Nobody at all means no email, since no one would
 * see it: those people are flagged on everyone's My Desk (checkInsWithoutOwner).
 */
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { EMAIL_KINDS, meetingWord, editExamples, editExamplesSection } from '@/lib/bot/editLearning';
import { stripDashes, firstName, withSignature, toneSection, voiceExamplesSection, subjectRules, pickSubject, PLAIN_VOICE_RULES } from '@/lib/bot/emailStyle';
import { senderVoice } from '@/lib/bot/voice';
import { personalPromptFor } from '@/lib/contacts/savePersonalFacts';
import { pickTemplate, templateSection } from '@/lib/bot/templatePick';
import { cadenceDaysFor, checkInDueDay, wantsCheckInDraft, checkInOrder, isCheckInDue, pickOwner } from '@/lib/checkIns/checkIns';

export const CHECK_IN_DRAFT_TYPE = 'CHECK_IN';
const FALLBACK_SUBJECT = 'Coffee soon?';
// The sweep stops starting new emails after this long, so it finishes inside
// the front door's 30 second wall. Whatever is left is written on the next run.
const SWEEP_BUDGET_MS = 20_000;

const CONTACT_SELECT = {
  id: true, name: true, preferredName: true, email: true, company: true, ownerId: true,
  cadenceTier: true, cadenceDays: true, lastInPersonAt: true, lastTouchpointAt: true, nextCheckInAt: true,
  client: { select: { id: true, name: true, cadenceDays: true, ownerId: true } },
};

/** Their last sales note with us, published and not archived. */
async function lastNoteWith(contactId) {
  const link = await prisma.noteContact.findFirst({
    where: { contactId, note: { isPublished: true, archivedAt: null } },
    orderBy: { note: { meetingDate: 'desc' } },
    select: { note: { select: { title: true, activityType: true, createdById: true } } },
  });
  return link?.note || null;
}

async function activeUserIds() {
  return new Set((await prisma.user.findMany({ where: { isActive: true }, select: { id: true } })).map(u => u.id));
}

async function ownerFor(contact, lastNote) {
  return pickOwner([contact.ownerId, contact.client?.ownerId, lastNote?.createdById], await activeUserIds());
}

function fallbackEmail(contact, sender) {
  const first = firstName(contact.preferredName || contact.name) || 'there';
  const me = firstName(sender?.name) || 'Mike';
  return {
    subject: FALLBACK_SUBJECT,
    body: `Hi ${first},\n\nHope things are good on your end.\n\n• Coffee or lunch in the next couple of weeks? Happy to come to you.\n\nBest,\n${me}`,
  };
}

/**
 * One short keep-in-touch email in the sender's voice (AI, with a plain fallback).
 * No knowledge library here on purpose: there is nothing technical to say, and
 * the library would add seconds to every email and risk the 30 second wall.
 */
export async function composeCheckInEmail(contact, ownerUserId, lastNote = null) {
  const sender = await senderVoice(ownerUserId);
  const me = firstName(sender?.name) || 'Mike';
  const emailKind = EMAIL_KINDS.KEEP_IN_TOUCH;
  const done = ({ subject, body }) => ({
    subject: pickSubject(subject, FALLBACK_SUBJECT), body: withSignature(stripDashes(body), sender), emailKind,
  });

  let key;
  try { key = getAnthropicKey()?.trim(); } catch { key = null; }
  if (!key) return done(fallbackEmail(contact, sender));

  const company = contact.client?.name || contact.company || '';
  const last = lastNote ? `\nThe last time we got together on record was a ${meetingWord(lastNote.activityType, lastNote.title).toLowerCase()}${lastNote.title ? ` ("${lastNote.title}")` : ''}. Never say when.` : '';
  let lessons = '';
  try { lessons = editExamplesSection(await editExamples(prisma, emailKind, 4, ownerUserId), sender?.name); } catch { /* draft without them */ }

  const prompt = `Write ONE short email from ${me} at ILC Studios (lighting) to ${contact.name}${company ? ` (${company})` : ''}.

Nothing is wrong and nothing is owed. It is a friendly keep-in-touch note because we have not talked in a while.${last}
Offer one easy next step, like coffee, lunch or a quick call. Warm, never pushy.
Never say "reminder", "check-in", "circling back" or "touching base", and never mention how long it has been.
${await personalPromptFor(contact.id, firstName(contact.preferredName || contact.name))}${templateSection(await pickTemplate({ text: 'keep in touch catch up coffee lunch quick call been a while' }))}${toneSection(sender?.toneProfile, sender?.name)}${voiceExamplesSection(sender?.samples, sender?.name)}${lessons}
Shape:
1. Greeting with their first name.
2. One or two short sentences, no more.
3. The next step as one bullet starting with "• ".
4. A sign-off word on its own line, then "${me}" on the next line. Nothing after that: the signature is added for you.

${PLAIN_VOICE_RULES}
${subjectRules('')}
Return ONLY JSON: {"subject": "...", "body": "..."}`;

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = wrapClient(new Anthropic({ apiKey: key }), 'bot.checkin.compose');
    const msg = await anthropic.messages.create({ ...modelParams('bot.checkin.compose'), max_tokens: 500, messages: [{ role: 'user', content: prompt }] });
    const parsed = JSON.parse((textFrom(msg) || '').replace(/```json|```/g, '').trim());
    if (parsed?.subject && parsed?.body) return done({ subject: String(parsed.subject), body: String(parsed.body) });
  } catch (e) {
    console.error('[composeCheckInEmail] AI compose failed, using fallback:', e?.message ?? e);
  }
  return done(fallbackEmail(contact, sender));
}

async function createDraft(contact, ownerUserId, lastNote, reason) {
  const { subject, body, emailKind } = await composeCheckInEmail(contact, ownerUserId, lastNote);
  return prisma.botDraft.create({
    data: {
      userId: ownerUserId, contactId: contact.id, type: CHECK_IN_DRAFT_TYPE, status: 'PENDING_REVIEW',
      toEmail: contact.email, toName: contact.name, subject, body, aiSubject: subject, aiBody: body, emailKind,
      classificationReason: reason,
    },
  });
}

/**
 * "Write email" on My Desk: the person asking gets the email. An email already
 * waiting for that person is handed back rather than written twice.
 */
export async function draftCheckInFor(contactId, userId) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: CONTACT_SELECT });
  if (!contact) return { error: 'Person not found', status: 404 };
  if (!contact.email) return { error: `No email on file for ${contact.name}`, status: 400 };
  const waiting = await prisma.botDraft.findFirst({
    where: { contactId, type: CHECK_IN_DRAFT_TYPE, status: 'PENDING_REVIEW' },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true } } },
  });
  // Waiting on someone else's desk: say whose, rather than write a second one.
  if (waiting) return { draft: waiting, existing: true, onDeskOf: waiting.userId === userId ? null : (waiting.user?.name || 'a teammate') };
  const draft = await createDraft(contact, userId, await lastNoteWith(contactId), 'Check-in email');
  return { draft, existing: false };
}

/** A check-in email nobody has touched is withdrawn when the person is snoozed. */
export async function withdrawCheckInDrafts(contactId, now = new Date()) {
  const rows = await prisma.botDraft.findMany({
    where: { contactId, type: CHECK_IN_DRAFT_TYPE, status: 'PENDING_REVIEW', editedByUserId: null },
    select: { id: true },
  });
  if (!rows.length) return 0;
  const { count } = await prisma.botDraft.updateMany({
    where: { id: { in: rows.map(r => r.id) } },
    data: { status: 'CANCELLED', cancelledAt: now, classificationReason: 'Withdrawn: check-in snoozed' },
  });
  return count;
}

/**
 * The daily sweep: everyone due tomorrow or today (and any backlog) gets their
 * email. @returns { considered, drafted, noOwner, deferred }
 */
export async function writeDueCheckInDrafts({ now = new Date(), budgetMs = SWEEP_BUDGET_MS } = {}) {
  const started = Date.now();
  const log = { considered: 0, drafted: 0, noOwner: 0, deferred: 0 };
  const rules = await prisma.relationshipCadenceRule.findMany({ where: { isActive: true } });
  const ruleByTier = Object.fromEntries(rules.map(r => [r.tier, r.cadenceDays]));
  const contacts = await prisma.contact.findMany({
    where: { email: { not: null }, OR: [{ lastInPersonAt: { not: null } }, { lastTouchpointAt: { not: null } }] },
    select: CONTACT_SELECT,
  });

  const lastDrafts = await prisma.botDraft.groupBy({
    by: ['contactId'], where: { type: CHECK_IN_DRAFT_TYPE, contactId: { in: contacts.map(c => c.id) } }, _max: { createdAt: true },
  });
  const lastBy = new Map(lastDrafts.map(r => [r.contactId, r._max.createdAt]));

  const due = contacts
    .map(c => ({ c, cadence: cadenceDaysFor(c, ruleByTier) }))
    .filter(({ c, cadence }) => wantsCheckInDraft(c, { cadenceDays: cadence, lastDraftAt: lastBy.get(c.id), now }))
    .map(x => ({ ...x, due: checkInDueDay(x.c, x.cadence) }))
    .sort((a, b) => checkInOrder(a, b, now));
  log.considered = due.length;

  for (const { c, due: day } of due) {
    if (Date.now() - started > budgetMs) { log.deferred++; continue; }
    const lastNote = await lastNoteWith(c.id);
    const owner = await ownerFor(c, lastNote);
    if (!owner) { log.noOwner++; continue; }
    const when = day > now ? 'due tomorrow' : 'due';
    await createDraft(c, owner, lastNote, `Check-in email (${when})`);
    log.drafted++;
  }
  return log;
}

/**
 * People whose check-in is due (or due tomorrow) with nobody to write it: no
 * owner on the person or the company, and no active salesperson has met them.
 * Shown on every salesperson's My Desk with a "Take them" button.
 */
export async function checkInsWithoutOwner({ now = new Date() } = {}) {
  const rules = await prisma.relationshipCadenceRule.findMany({ where: { isActive: true } });
  const ruleByTier = Object.fromEntries(rules.map(r => [r.tier, r.cadenceDays]));
  const active = await activeUserIds();
  const contacts = await prisma.contact.findMany({
    where: { OR: [{ lastInPersonAt: { not: null } }, { lastTouchpointAt: { not: null } }] },
    select: CONTACT_SELECT,
  });
  const due = contacts
    .map(c => ({ c, cadence: cadenceDaysFor(c, ruleByTier) }))
    .filter(({ c, cadence }) => isCheckInDue(c, cadence, now) && !pickOwner([c.ownerId, c.client?.ownerId], active));
  if (!due.length) return [];

  // Whoever wrote their newest published note would do; one query for everyone.
  const links = await prisma.noteContact.findMany({
    where: { contactId: { in: due.map(x => x.c.id) }, note: { isPublished: true, archivedAt: null } },
    select: { contactId: true, note: { select: { createdById: true, meetingDate: true, createdAt: true } } },
  });
  const newest = new Map();
  for (const l of links) {
    const t = new Date(l.note.meetingDate || l.note.createdAt).getTime();
    if (!newest.has(l.contactId) || t > newest.get(l.contactId).t) newest.set(l.contactId, { t, by: l.note.createdById });
  }
  return due
    .filter(({ c }) => !pickOwner([newest.get(c.id)?.by], active))
    .map(({ c, cadence }) => ({
      id: c.id, name: c.name, email: c.email, company: c.client?.name || c.company || '',
      clientId: c.client?.id || null, due: checkInDueDay(c, cadence),
    }))
    .sort((a, b) => a.due - b.due);
}

/**
 * "Take them": the person is now looked after by this user, and when the
 * check-in is due and there is an email address, its email is written now.
 * Someone already looking after them is never replaced from here.
 */
export async function takeContact(contactId, userId) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { ...CONTACT_SELECT, owner: { select: { name: true, isActive: true } } } });
  if (!contact) return { error: 'Person not found', status: 404 };
  if (contact.ownerId && contact.ownerId !== userId && contact.owner?.isActive) {
    return { error: `${contact.owner.name || 'A teammate'} already looks after ${contact.name}.`, status: 409 };
  }
  await prisma.contact.update({ where: { id: contactId }, data: { ownerId: userId } });
  if (!contact.email) return { ok: true, drafted: false };
  const out = await draftCheckInFor(contactId, userId);
  return out.error ? { ok: true, drafted: false } : { ok: true, drafted: true, draftId: out.draft.id };
}
