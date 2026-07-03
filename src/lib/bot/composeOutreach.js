/**
 * composeOutreach.js — turn several confirmed asks for ONE contact into ONE email.
 *
 * Multiple action items can target the same person (e.g. "set up lunch" +
 * "get drawings for the new project"). Rather than draft an email per item, we
 * group a contact's confirmed outreach asks and compose a single cohesive email.
 */
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';

// Methods that belong in an outreach email to the contact.
export const OUTREACH_EMAIL_METHODS = new Set(['EMAIL', 'SEND_MATERIALS', 'SCHEDULE']);

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

  const eligible = actions.filter(a => OUTREACH_EMAIL_METHODS.has(execByKey.get(a.type)));
  if (eligible.length === 0) return [];

  const contactIds = [...new Set(eligible.map(a => a.contactId))];
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, name: true, preferredName: true, email: true, company: true },
  });
  const cById = new Map(contacts.map(c => [c.id, c]));

  const groups = new Map();
  for (const a of eligible) {
    const g = groups.get(a.contactId) || {
      contactId: a.contactId,
      contactName: cById.get(a.contactId)?.name || a.contactName || 'contact',
      email: cById.get(a.contactId)?.email || '',
      company: cById.get(a.contactId)?.company || a.company || '',
      contact: cById.get(a.contactId) || null,
      actions: [],
    };
    g.actions.push({ id: a.id, label: labelByKey.get(a.type) || a.type, detail: a.detail || a.rawText, targetName: a.targetName, botDraftId: a.botDraftId });
    groups.set(a.contactId, g);
  }
  return [...groups.values()];
}

function fallbackEmail(group) {
  const first = (group.contact?.preferredName || group.contactName || '').split(' ')[0] || 'there';
  const lines = group.actions.map(a => `• ${a.detail}`).join('\n');
  return {
    subject: `Following up — ${group.actions.length} item${group.actions.length !== 1 ? 's' : ''}`,
    body: `Hi ${first},\n\nGreat connecting. A couple of things on my end:\n\n${lines}\n\nBest,\nMike`,
  };
}

/** Compose ONE email covering all of a group's asks (AI, with a deterministic fallback). */
export async function composeContactEmail(group) {
  const askList = group.actions.map(a => `- ${a.label}: ${a.detail}${a.targetName ? ` (re ${a.targetName})` : ''}`).join('\n');
  let key;
  try { key = getAnthropicKey()?.trim(); } catch { key = null; }
  if (!key) return fallbackEmail(group);

  const prompt = `Write ONE short, warm, professional outreach email from Mike at ILC Studios (lighting) to ${group.contactName}${group.company ? ` (${group.company})` : ''}.

It must cover ALL of these follow-up items in a single email — one greeting, one sign-off, no repetition:
${askList}

Keep it concise and natural (not a bulleted list unless it reads well). Sign off as "Mike".
Return ONLY JSON: {"subject": "...", "body": "..."}`;

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: key });
    const msg = await anthropic.messages.create({ model: 'claude-haiku-4-5', max_tokens: 700, messages: [{ role: 'user', content: prompt }] });
    const raw = (msg.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    if (parsed?.subject && parsed?.body) return { subject: String(parsed.subject), body: String(parsed.body) };
  } catch (e) {
    console.error('[composeContactEmail] AI compose failed, using fallback:', e?.message ?? e);
  }
  return fallbackEmail(group);
}

/** Compose extra paragraph(s) to APPEND to an email the human already edited —
 * one short paragraph per new ask, in Mike's voice, no greeting/sign-off. */
async function composeAppendParagraphs(group, newAsks) {
  const fallback = () => newAsks.map(a => a.detail).filter(Boolean).join('\n\n');
  let key;
  try { key = getAnthropicKey()?.trim(); } catch { key = null; }
  if (!key) return fallback();

  const askList = newAsks.map(a => `- ${a.label}: ${a.detail}${a.targetName ? ` (re ${a.targetName})` : ''}`).join('\n');
  const prompt = `Write ${newAsks.length === 1 ? 'ONE short paragraph' : `${newAsks.length} short paragraphs (one per item)`} to ADD to an existing email to ${group.contactName} from Mike at ILC Studios. Cover:
${askList}

Rules: NO greeting, NO sign-off — these paragraphs are inserted into an email that already has them. Natural and concise, Mike's voice. Separate multiple paragraphs with a blank line. Return ONLY the paragraph text.`;
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: key });
    const msg = await anthropic.messages.create({ model: 'claude-haiku-4-5', max_tokens: 500, messages: [{ role: 'user', content: prompt }] });
    const text = (msg.content?.[0]?.text || '').trim();
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
 * if the human already edited/sent it, a fresh draft is made. Idempotent — safe
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
  // paused). Asks already on a SENT/CANCELLED draft are done — never re-send them.
  const openAsks = group.actions.filter(a => !a.botDraftId || WORKING_DRAFT_STATUSES.has(dById.get(a.botDraftId)?.status));
  if (openAsks.length === 0) return { skipped: 'all already sent' };

  const openGroup = { ...group, actions: openAsks };
  const reason = `Consolidated outreach (${openAsks.length} item${openAsks.length !== 1 ? 's' : ''}) from a sales note`;
  // Reuse a working draft (live or paused); always reactivate it to PENDING_REVIEW.
  const pending = drafts.find(d => WORKING_DRAFT_STATUSES.has(d.status)) || null;

  let draft, mode;
  if (!pending) {
    // No working draft yet → compose a fresh one covering the open asks.
    const { subject, body } = await composeContactEmail(openGroup);
    draft = await prisma.botDraft.create({
      data: {
        userId: ownerUserId, type: 'FOLLOW_UP', status: 'PENDING_REVIEW',
        toEmail: group.email || '', toName: group.contactName,
        subject, body, reviewWindowMinutes, classificationReason: reason,
      },
    });
    mode = 'created';
  } else if (!pending.editedByUserId) {
    // Untouched draft → safe to fully recompose covering all open asks.
    const { subject, body } = await composeContactEmail(openGroup);
    draft = await prisma.botDraft.update({
      where: { id: pending.id },
      data: { subject, body, status: 'PENDING_REVIEW', toEmail: group.email || '', toName: group.contactName, classificationReason: reason },
    });
    mode = 'recomposed';
  } else {
    // Human edited it → preserve their text; append only the NEW asks as paragraphs.
    const newAsks = openAsks.filter(a => a.botDraftId !== pending.id);
    const body = newAsks.length
      ? `${pending.body.replace(/\s+$/, '')}\n\n${await composeAppendParagraphs(openGroup, newAsks)}`
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
