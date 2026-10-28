/**
 * extractNoteActions.js, turns a note's prose into structured actions + intel.
 * Mirrors the followUpDrafter Anthropic pattern.
 *
 * The taxonomy is admin-controlled (NoteActionType table). The caller loads the
 * active types and passes them in, so this lib stays DB-agnostic. Each "type"
 * names a METHOD/executor (Email, Text, Call, Schedule, Expect intro, Send
 * materials, Add to list, Internal task, Intel) so the bot knows what to do.
 */
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import { DEFAULT_ACTION_TYPES } from '@/lib/noteActions';
import { cleanCategory, cleanFact, PERSONAL_CATEGORIES } from '@/lib/contacts/personalFacts';
import { fixStepType, stepDue } from '@/lib/notes/stepFixes';
import { leadFromText } from '@/lib/notes/owners';

// Try to resolve a free-text person name to a CRM contact id.
export function resolveContact(name, candidates) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (!n) return null;
  // exact, then first-name / contained match
  let hit = candidates.find(c => c.name?.toLowerCase() === n);
  if (!hit) hit = candidates.find(c => c.name && (c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase().split(' ')[0])));
  return hit?.id || null;
}

/**
 * @param {object} note  { title, body }
 * @param {Array}  candidateContacts  [{ id, name }], for soft contact resolution
 * @param {Array}  actionTypes  active NoteActionType rows [{ key, label, kind, description }], defaults to DEFAULT_ACTION_TYPES
 * @returns {Array} NoteAction-shaped objects (no ids) ready to persist
 */
export async function extractNoteActions(note, candidateContacts = [], actionTypes = null) {
  return (await readNote(note, candidateContacts, actionTypes)).actions;
}

/**
 * The same one AI call, returning the next steps AND the personal things said
 * (kids, sports, hobbies, coffee order). Personal lines never become actions.
 * @returns {{ actions: Array, personal: Array<{category, fact, contactName, contactId}> }}
 */
export async function readNote(note, candidateContacts = [], actionTypes = null, { owners = [] } = {}) {
  const body = (note?.body || '').trim();
  if (!body) return { actions: [], personal: [] };
  // Deadlines are read against the meeting day (Mike 9-27: "by Friday" is a due date).
  const meetingDate = new Date(note?.meetingDate || note?.createdAt || Date.now());
  const meetingDay = `${meetingDate.toISOString().slice(0, 10)} (${meetingDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })})`;
  const ownerNames = owners.map(o => String(o?.name || '').trim()).filter(Boolean);

  const types = (Array.isArray(actionTypes) && actionTypes.length)
    ? actionTypes
    : DEFAULT_ACTION_TYPES;
  const typeByKey = new Map(types.map(t => [t.key, t]));
  const VALID = new Set(types.map(t => t.key));

  const typeList = types
    .map(t => `- ${t.key} (${t.kind}): ${t.label}${t.description ? `: ${t.description}` : ''}`)
    .join('\n');

  const prompt = `You extract structured items from a sales/relationship meeting note. The note is a terse to-do / next-steps list. The note itself follows below, inside the marked block.

Classify each meaningful line into exactly one type below. The type names the METHOD/action the bot should take (or INTEL for a fact):
${typeList}

Rules:
- ACTIONS are follow-ups/to-dos. INTEL is a FACT about a person or company (NOT a to-do), e.g. "Acme does student housing out of St. Louis".
- Pick the type that matches HOW the follow-up should happen: emailing → EMAIL, texting → TEXT, calling → CALL, setting up a meeting/coffee/golf → SCHEDULE, waiting for someone to introduce me → EXPECT_INTRO, sending a deck/DocSend/pricing → SEND_MATERIALS, adding someone to a list (e.g. golf league) → ADD_TO_LIST, an internal ILC to-do → INTERNAL_TASK.
- For EXPECT_INTRO: "contact" = the person who will make the intro; "target" = the third party being introduced.
- Things the OTHER person said they would do are their own types, so the app can watch the inbox for them: they will send drawings / plans / a set / files, or send jobs for peer review → EXPECT_DRAWINGS; they will send a calendar invite or set up the next meeting themselves → EXPECT_INVITE; they will get back to me / check and reply / let me know → EXPECT_REPLY. Things MIKE will do stay EMAIL / SEND_MATERIALS / SCHEDULE.
- If the line says to email someone, the type is EMAIL, even when the email carries materials ("email Jane the specs" is EMAIL). SEND_MATERIALS is for sending a deck, DocSend or pricing some other way.${typeByKey.has('REMIND_ME') ? `
- "Remind me to…" is REMIND_ME: a reminder for us to do something later. The detail is the thing to do, without "remind me".` : ''}
- The meeting was on ${meetingDay}. If the line gives a deadline or a time ("by Friday", "next week", "in 2 weeks", "end of month", "10/15"), put it in "due" as YYYY-MM-DD, counted from the meeting day. No deadline in the line: "due" is null. Never guess one.${ownerNames.length ? `
- These people are from our side (ILC) and own this note: ${ownerNames.join(', ')}. A line starting with one of their names ("${ownerNames[0].split(/\s+/)[0]} to call Jane") says who does the step; they are never the "contact".` : ''}
- Extract any person name (contact), third party (target), and company or project mentioned.
- PERSONAL: something about the person's life outside work that they mentioned (family, kids and their activities, sports they play or follow, hobbies, favorite food or drink, trips, pets). Return it as type "PERSONAL" with "category" one of ${PERSONAL_CATEGORIES.join(', ')} and "detail" a short plain fact about them, e.g. "Has two kids who play soccer", "Likes cold brew". Only what the note actually says; never guess or embellish. A to-do can also reveal a personal interest: "wants to golf in October, set it up" is a SCHEDULE step AND a PERSONAL fact "Likes golf"; "make a cold brew tasting sheet" is a to-do AND "Likes cold brew". Return both.

Return ONLY a JSON array. Each element:
{ "type": "<KEY>" | "PERSONAL", "kind": "ACTION" | "INTEL" | "PERSONAL", "category": <PERSONAL only, else null>, "rawText": "<original line>", "detail": "<short normalized phrasing>", "contact": <name or null>, "target": <name or null>, "company": <name or null>, "due": "<YYYY-MM-DD>" | null }`;

  let parsed = [];
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    // Recorded: see src/lib/agent/ledger.js.
    const anthropic = wrapClient(
      new Anthropic({ apiKey: (await getAnthropicKey()) }),
      'bot.note.extractActions',
      { projectId: note?.projectId || null, userId: note?.createdById || null },
    );
    // Mike types these notes, so the note is *mostly* ours, but a meeting note
    // routinely has a client's email pasted into it, and the old form wrapped the
    // body in `"""`, which any pasted content containing `"""` closes for free.
    // The output of this call schedules bot actions, so a line that reads as an
    // instruction is worth fencing. See src/lib/agent/untrusted.js.
    const sealed = buildUntrustedPrompt({
      instructions: prompt,
      documents:    [{ text: `${note.title || ''}\n\n${body}`, descriptor: 'meeting note', maxChars: 20000 }],
    });
    warnOnInjection('bot.note.extractActions', note?.projectId || null, sealed);

    const msg = await anthropic.messages.create({
      ...modelParams('bot.noteActions'),
      max_tokens: 2000,
      system:   sealed.system,
      messages: [{ role: 'user', content: sealed.content }],
    });
    const raw = textFrom(msg)?.trim() || '[]';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) parsed = [];
  } catch (e) {
    console.error('[extractNoteActions] Claude call failed:', e?.message ?? e);
    return { actions: [], personal: [] };
  }

  const isPersonal = it => it && (it.type === 'PERSONAL' || it.kind === 'PERSONAL');
  const personal = parsed
    .filter(it => isPersonal(it) && cleanFact(it.detail || it.rawText))
    .map(it => ({
      category:    cleanCategory(it.category),
      fact:        cleanFact(it.detail || it.rawText),
      contactName: it.contact || null,
      contactId:   resolveContact(it.contact, candidateContacts),
    }));

  const actions = parsed
    .filter(it => it && it.rawText && !isPersonal(it))
    .map(it => {
      const type = fixStepType(VALID.has(it.type) ? it.type : 'OTHER', it.rawText, VALID, ownerNames);
      const kind = typeByKey.get(type)?.kind || (it.kind === 'INTEL' ? 'INTEL' : 'ACTION');
      const ours = n => n && ownerNames.some(o => o.toLowerCase() === String(n).trim().toLowerCase() || o.split(/\s+/)[0].toLowerCase() === String(n).trim().toLowerCase());
      const contactName = ours(it.contact) ? null : (it.contact || null);
      const step = kind === 'ACTION';
      return {
        kind,
        type,
        dueDate:     step ? stepDue(it.due, it.rawText, meetingDate) : null,
        leadUserId:  step ? leadFromText(it.rawText, owners) : null,
        rawText:     String(it.rawText).slice(0, 500),
        detail:      it.detail ? String(it.detail).slice(0, 300) : null,
        contactId:   resolveContact(contactName, candidateContacts),
        contactName: contactName || null,
        targetName:  it.target || null,
        company:     it.company || null,
        status:      'SUGGESTED',
        source:      'ai',
      };
    });
  return { actions, personal };
}
