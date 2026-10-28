/**
 * composeOutreach.js, turn several confirmed asks for ONE contact into ONE email.
 *
 * Multiple action items can target the same person (e.g. "set up lunch" +
 * "get drawings for the new project"). Rather than draft an email per item, we
 * group a contact's confirmed outreach asks and compose a single cohesive email.
 */
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { knowledgeContextBlock } from '@/lib/botKnowledge/retrieve';
import { WAIT_EXECUTORS } from '@/lib/followUp/watch';
import { EMAIL_KINDS, followUpSubject, editExamples, editExamplesSection } from '@/lib/bot/editLearning';
import { stripDashes, hasBullets, firstName, withSignature, insertBeforeSignOff, toneSection, voiceExamplesSection, subjectRules, pickSubject, PLAIN_VOICE_RULES } from '@/lib/bot/emailStyle';
import { senderVoice } from '@/lib/bot/voice';
import { personalPromptFor } from '@/lib/contacts/savePersonalFacts';
import { ownerIdsOf, senderFor as pickSender } from '@/lib/notes/owners';
import { pickTemplate, templateSection } from '@/lib/bot/templatePick';

// Methods that belong in an outreach email to the contact.
export const OUTREACH_EMAIL_METHODS = new Set(['EMAIL', 'SEND_MATERIALS', 'SCHEDULE']);

// Things THEY offered to do (reply, drawings, invite, intro) also go in the
// recap email, thanked and confirmed, never demanded (Mike 9-25). They are
// watched for separately; see src/lib/followUp/.
export const RECAP_EMAIL_METHODS = new Set([...OUTREACH_EMAIL_METHODS, ...Object.keys(WAIT_EXECUTORS)]);

// Draft statuses that are still "working" (reusable). DRAFT = paused because the
// note was reverted to draft; PENDING_REVIEW = live in the queue.
const WORKING_DRAFT_STATUSES = new Set(['PENDING_REVIEW', 'DRAFT']);

/**
 * Confirmed, not-yet-drafted outreach asks on a note, grouped by contact.
 * Only asks with a linked CRM contact can be grouped (we need someone to email).
 * @returns [{ contactId, contactName, email, company, actions: [...] }]
 */
export async function getOutreachGroups(noteId, { includeDrafted = false } = {}) {
  const where = { noteId, kind: 'ACTION', status: 'CONFIRMED', contactId: { not: null } };
  if (!includeDrafted) where.executedAt = null;
  const actions = await prisma.noteAction.findMany({ where, orderBy: { createdAt: 'asc' } });
  if (actions.length === 0) return [];

  const typeKeys = [...new Set(actions.map(a => a.type))];
  const types = await prisma.noteActionType.findMany({ where: { key: { in: typeKeys } } });
  const execByKey = new Map(types.map(t => [t.key, t.executor]));
  const labelByKey = new Map(types.map(t => [t.key, t.label]));

  const eligible = actions.filter(a => RECAP_EMAIL_METHODS.has(execByKey.get(a.type)));
  if (eligible.length === 0) return [];

  const contactIds = [...new Set(eligible.map(a => a.contactId))];
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, name: true, preferredName: true, email: true, company: true, title: true },
  });
  const cById = new Map(contacts.map(c => [c.id, c]));
  const note = await prisma.note.findUnique({ where: { id: noteId }, select: { activityType: true, title: true } });

  const groups = new Map();
  for (const a of eligible) {
    const g = groups.get(a.contactId) || {
      contactId: a.contactId,
      meetingType: note?.activityType || null, meetingTitle: note?.title || '',
      contactName: cById.get(a.contactId)?.name || a.contactName || 'contact',
      email: cById.get(a.contactId)?.email || '',
      company: cById.get(a.contactId)?.company || a.company || '',
      contact: cById.get(a.contactId) || null,
      actions: [],
    };
    g.actions.push({ id: a.id, label: labelByKey.get(a.type) || a.type, detail: a.detail || a.rawText, targetName: a.targetName, botDraftId: a.botDraftId,
                     waitingFor: WAIT_EXECUTORS[execByKey.get(a.type)] || null });
    groups.set(a.contactId, g);
  }
  return [...groups.values()];
}

// Who the email is from: the draft's owner (the salesperson), never assumed to
// be Mike. Their signature, tone profile and real emails come with them.
const senderFor = group => senderVoice(group.ownerUserId);

function fallbackEmail(group, sender) {
  const first = (group.contact?.preferredName || group.contactName || '').split(' ')[0] || 'there';
  const me = firstName(sender?.name) || 'Mike';
  const lines = group.actions.map(a => `• ${a.detail}`).join('\n');
  if (group.nudge) {
    return {
      subject: followUpSubject(group.meetingType, group.meetingTitle),
      body: `Hi ${first},\n\nHope all is well. Quick check-in on where things stand:\n\n${lines}\n\nNo rush. Let me know if I can help on my end.\n\nBest,\n${me}`,
    };
  }
  return {
    subject: followUpSubject(group.meetingType, group.meetingTitle),
    body: `Hi ${first},\n\nGreat seeing you. Next steps:\n\n${lines}\n\nBest,\n${me}`,
  };
}

// Last step for every email this file writes: no dashes, bullets present,
// the sender's signature underneath.
function finish({ subject, body }, group, sender, emailKind) {
  let clean = stripDashes(body);
  if (!hasBullets(clean)) ({ body: clean } = fallbackEmail(group, sender));
  return { subject: pickSubject(subject, followUpSubject(group.meetingType, group.meetingTitle)), body: withSignature(clean, sender), emailKind };
}

// The knowledge library, whole, ordered around this contact and these asks.
//
// Added 2026-09-08. This is the OTHER email the sales bot writes, the one that
// comes out of a sales note, and it was drafting with no knowledge at all while
// the follow-up drafter had it. Mike asked for the library to feed the sales bot;
// feeding half of the sales bot is not that. Failure is non-fatal on purpose: a
// knowledge query that throws must never cost us the email.
async function knowledgeFor(group) {
  const query = [
    group.contactName,
    group.company,
    ...group.actions.map(a => `${a.label} ${a.detail || ''} ${a.targetName || ''}`),
  ].filter(Boolean).join(' ');

  try {
    return await knowledgeContextBlock({ query });
  } catch (e) {
    console.error('[composeOutreach] knowledge lookup failed, drafting without it:', e?.message ?? e);
    return '';
  }
}

// What this email is about, for picking the closest template (Mike 10-1). The
// items, not the names: a name in a template body says nothing about its topic.
async function templateFor(group) {
  const text = [group.nudge ? 'check in' : 'meeting recap next steps', ...group.actions.map(a => `${a.label} ${a.detail || ''} ${a.targetName || ''}`)].join(' ');
  return templateSection(await pickTemplate({ scenario: group.nudge ? 'follow_up' : 'meeting_recap', text, contactTitle: group.contact?.title || null }));
}

function knowledgeSection(text) {
  return text
    ? `\nILC's knowledge library: everything we have taught the bot, in full. Use whatever is
genuinely relevant and ignore the rest. Never mention the library, and never force a fact
in just because it is here:\n${text}\n`
    : '';
}

async function lessonsFor(emailKind, sender, userId) {
  try { return editExamplesSection(await editExamples(prisma, emailKind, 4, userId), sender?.name); }
  catch (e) {
    console.error('[composeOutreach] edit examples failed, drafting without them:', e?.message ?? e);
    return '';
  }
}

/**
 * Compose ONE email covering all of a group's asks (AI, with a deterministic
 * fallback). Returns { subject, body, emailKind }, the caller also stores
 * subject and body as aiSubject/aiBody so a person's later edits can be learned.
 */
export async function composeContactEmail(group) {
  const emailKind = group.nudge ? EMAIL_KINDS.CHECK_IN : EMAIL_KINDS.RECAP;
  const meetingNoun = followUpSubject(group.meetingType, group.meetingTitle).replace(/ follow-up$/, '').toLowerCase();
  const line = a => `- ${a.label}: ${a.detail}${a.targetName ? ` (re ${a.targetName})` : ''}`;
  const ours = group.actions.filter(a => !a.waitingFor);
  const theirs = group.actions.filter(a => a.waitingFor);
  const sender = await senderFor(group);
  const me = firstName(sender?.name) || 'Mike';
  let key;
  try { key = (await getAnthropicKey())?.trim(); } catch { key = null; }
  if (!key) return finish(fallbackEmail(group, sender), group, sender, emailKind);

  const items = group.nudge
    ? `This is a light check-in about things from our meeting that have not happened yet:
${theirs.concat(ours).map(line).join('\n')}
Helpful, never pushy or guilt-inducing. Do not say "reminder" or mention how long it has been.`
    : `It is the recap after our meeting and must cover ALL of these items in one email, with one greeting and one sign-off:
${ours.length ? `Things ${me} will do or is asking for:\n${ours.map(line).join('\n')}\n` : ''}${theirs.length ? `Things they offered to do. Thank them and confirm, never demand:\n${theirs.map(line).join('\n')}\n` : ''}`;

  const prompt = `Write ONE short email from ${me} at ILC Studios (lighting) to ${group.contactName}${group.company ? ` (${group.company})` : ''}.

${items}
${await personalPromptFor(group.contactId, firstName(group.contactName))}${knowledgeSection(await knowledgeFor(group))}${await templateFor(group)}${toneSection(sender?.toneProfile, sender?.name)}${voiceExamplesSection(sender?.samples, sender?.name)}${await lessonsFor(emailKind, sender, group.ownerUserId)}
Shape (Mike 9-26: bullets, not a long narrative):
1. Greeting with their first name.
2. One or two short sentences, no more.
3. The next steps as bullet points starting with "• ", one short line each, saying who does what.
4. One short closing line.
5. A sign-off word on its own line, then "${me}" on the next line. Nothing after that: the signature is added for you.

${PLAIN_VOICE_RULES}
It may be reviewed and sent days after the meeting, so never say when the meeting was:
no "today", "yesterday", "this morning" or "earlier this week". Say "our ${meetingNoun}" instead.
${subjectRules(meetingNoun)}
Return ONLY JSON: {"subject": "...", "body": "..."}`;

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    // Recorded: see src/lib/agent/ledger.js. Composing a whole email and
    // appending to one already edited are separate tasks on purpose, they have
    // different failure modes and the rollup should not average them together.
    const anthropic = wrapClient(new Anthropic({ apiKey: key }), 'bot.outreach.compose');
    const msg = await anthropic.messages.create({ ...modelParams('bot.outreach.compose'), max_tokens: 700, messages: [{ role: 'user', content: prompt }] });
    const raw = (textFrom(msg) || '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    if (parsed?.subject && parsed?.body) return finish({ subject: String(parsed.subject), body: String(parsed.body) }, group, sender, emailKind);
  } catch (e) {
    console.error('[composeContactEmail] AI compose failed, using fallback:', e?.message ?? e);
  }
  return finish(fallbackEmail(group, sender), group, sender, emailKind);
}

/** Compose extra paragraph(s) to APPEND to an email the human already edited
 * one short paragraph per new ask, in Mike's voice, no greeting/sign-off. */
async function composeAppendParagraphs(group, newAsks) {
  const fallback = () => newAsks.map(a => a.detail).filter(Boolean).map(d => `• ${d}`).join('\n');
  let key;
  try { key = (await getAnthropicKey())?.trim(); } catch { key = null; }
  if (!key) return fallback();

  const askList = newAsks.map(a => `- ${a.label}: ${a.detail}${a.targetName ? ` (re ${a.targetName})` : ''}`).join('\n');
  const sender = await senderFor(group);
  const me = firstName(sender?.name) || 'Mike';
  const prompt = `Write a short lead-in line and then ${newAsks.length === 1 ? 'ONE bullet' : `${newAsks.length} bullets (one per item)`} starting with "• " to ADD to an existing email to ${group.contactName} from ${me} at ILC Studios. Cover:
${askList}
${knowledgeSection(await knowledgeFor({ ...group, actions: newAsks }))}${toneSection(sender?.toneProfile, sender?.name)}${voiceExamplesSection(sender?.samples, sender?.name)}
${PLAIN_VOICE_RULES}
NO greeting and NO sign-off: this goes inside an email that already has them. Return ONLY the text.`;
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = wrapClient(new Anthropic({ apiKey: key }), 'bot.outreach.appendParagraphs');
    const msg = await anthropic.messages.create({ ...modelParams('bot.outreach.subject'), max_tokens: 500, messages: [{ role: 'user', content: prompt }] });
    const text = stripDashes((textFrom(msg) || '').trim());
    return text || fallback();
  } catch (e) {
    console.error('[composeAppendParagraphs] failed, using fallback:', e?.message ?? e);
    return fallback();
  }
}

/**
 * Compose/keep ONE email per contact covering ALL their confirmed outreach asks.
 * Recompose-aware: if a still-pending, un-edited draft already exists for the
 * group it's updated in place (so adding a 2nd ask doesn't make a 2nd email);
 * if the human already edited/sent it, a fresh draft is made. Idempotent, safe
 * to call automatically each time an ask is confirmed. Returns { draftId, count }.
 */
export async function draftContactOutreach(noteId, contactId, ownerUserId, reviewWindowMinutes = 30) {
  const groups = await getOutreachGroups(noteId, { includeDrafted: true });
  const group = groups.find(g => g.contactId === contactId);
  if (!group || group.actions.length === 0) return { error: 'No outreach asks for that contact' };

  // Look up the status of any drafts these asks already belong to.
  const draftIds = [...new Set(group.actions.map(a => a.botDraftId).filter(Boolean))];
  const drafts = draftIds.length
    ? await prisma.botDraft.findMany({ where: { id: { in: draftIds } } })
    : [];
  const dById = new Map(drafts.map(d => [d.id, d]));

  // "Open" asks = not yet on any draft, or on a still-working one (pending OR
  // paused). Asks already on a SENT/CANCELLED draft are done, never re-send them.
  const openAsks = group.actions.filter(a => !a.botDraftId || WORKING_DRAFT_STATUSES.has(dById.get(a.botDraftId)?.status));
  if (openAsks.length === 0) return { skipped: 'all already sent' };

  // Shared notes (0108): the steps' lead sends; unsure, somebody picks on My Desk.
  const [steps, note] = await Promise.all([
    prisma.noteAction.findMany({ where: { id: { in: openAsks.map(a => a.id) } }, select: { leadUserId: true } }),
    prisma.note.findUnique({ where: { id: noteId }, select: { createdById: true, owners: { select: { userId: true } } } }),
  ]);
  const pick = note ? pickSender(steps, ownerIdsOf(note), note.createdById) : { userId: ownerUserId, pending: false };
  const pending = drafts.find(d => WORKING_DRAFT_STATUSES.has(d.status)) || null;
  // A sender somebody already picked on My Desk stays picked.
  const keepSender = pending && !pending.senderPending;
  const sender = keepSender ? { userId: pending.userId, pending: false } : { userId: pick.userId || ownerUserId, pending: pick.pending };
  const openGroup = { ...group, actions: openAsks, ownerUserId: sender.userId };
  const reason = `Consolidated outreach (${openAsks.length} item${openAsks.length !== 1 ? 's' : ''}) from a sales note`;
  // Reuse a working draft (live or paused); always reactivate it to PENDING_REVIEW.

  let draft, mode;
  if (!pending) {
    // No working draft yet → compose a fresh one covering the open asks.
    const { subject, body, emailKind } = await composeContactEmail(openGroup);
    draft = await prisma.botDraft.create({
      data: {
        userId: sender.userId, senderPending: sender.pending, type: 'FOLLOW_UP', status: 'PENDING_REVIEW',
        toEmail: group.email || '', toName: group.contactName,
        subject, body, aiSubject: subject, aiBody: body, emailKind,
        reviewWindowMinutes, classificationReason: reason,
      },
    });
    mode = 'created';
  } else if (!pending.editedByUserId) {
    // Untouched draft → safe to fully recompose covering all open asks.
    const { subject, body, emailKind } = await composeContactEmail(openGroup);
    draft = await prisma.botDraft.update({
      where: { id: pending.id },
      data: { userId: sender.userId, senderPending: sender.pending, subject, body, aiSubject: subject, aiBody: body, emailKind, status: 'PENDING_REVIEW', toEmail: group.email || '', toName: group.contactName, classificationReason: reason },
    });
    mode = 'recomposed';
  } else {
    // Human edited it → preserve their text; append only the NEW asks as paragraphs.
    const newAsks = openAsks.filter(a => a.botDraftId !== pending.id);
    const body = newAsks.length
      ? insertBeforeSignOff(pending.body, await composeAppendParagraphs(openGroup, newAsks), await senderFor(openGroup))
      : pending.body;
    draft = await prisma.botDraft.update({
      where: { id: pending.id },
      data: { body, status: 'PENDING_REVIEW', classificationReason: reason },
    });
    mode = 'appended';
  }

  await prisma.noteAction.updateMany({
    where: { id: { in: openAsks.map(a => a.id) } },
    data: { executedAt: new Date(), botDraftId: draft.id },
  });
  return { draftId: draft.id, count: openAsks.length, mode };
}
