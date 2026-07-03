/**
 * extractNoteActions.js — turns a note's prose into structured actions + intel.
 * Mirrors the followUpDrafter Anthropic pattern.
 *
 * The taxonomy is admin-controlled (NoteActionType table). The caller loads the
 * active types and passes them in, so this lib stays DB-agnostic. Each "type"
 * names a METHOD/executor (Email, Text, Call, Schedule, Expect intro, Send
 * materials, Add to list, Internal task, Intel) so the bot knows what to do.
 */
import { getAnthropicKey } from '@/lib/anthropicKey';
import { DEFAULT_ACTION_TYPES } from '@/lib/noteActions';

// Try to resolve a free-text person name to a CRM contact id.
function resolveContact(name, candidates) {
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
 * @param {Array}  candidateContacts  [{ id, name }]  — for soft contact resolution
 * @param {Array}  actionTypes  active NoteActionType rows [{ key, label, kind, description }] — defaults to DEFAULT_ACTION_TYPES
 * @returns {Array} NoteAction-shaped objects (no ids) ready to persist
 */
export async function extractNoteActions(note, candidateContacts = [], actionTypes = null) {
  const body = (note?.body || '').trim();
  if (!body) return [];

  const types = (Array.isArray(actionTypes) && actionTypes.length)
    ? actionTypes
    : DEFAULT_ACTION_TYPES;
  const typeByKey = new Map(types.map(t => [t.key, t]));
  const VALID = new Set(types.map(t => t.key));

  const typeList = types
    .map(t => `- ${t.key} (${t.kind}): ${t.label}${t.description ? ` — ${t.description}` : ''}`)
    .join('\n');

  const prompt = `You extract structured items from a sales/relationship meeting note. The note is a terse to-do / next-steps list.

Note title: "${note.title || ''}"
Note body:
"""
${body}
"""

Classify each meaningful line into exactly one type below. The type names the METHOD/action the bot should take (or INTEL for a fact):
${typeList}

Rules:
- ACTIONS are follow-ups/to-dos. INTEL is a FACT about a person or company (NOT a to-do) — e.g. "Acme does student housing out of St. Louis".
- Pick the type that matches HOW the follow-up should happen: emailing → EMAIL, texting → TEXT, calling → CALL, setting up a meeting/coffee/golf → SCHEDULE, waiting for someone to introduce me → EXPECT_INTRO, sending a deck/DocSend/pricing → SEND_MATERIALS, adding someone to a list (e.g. golf league) → ADD_TO_LIST, an internal ILC to-do → INTERNAL_TASK.
- For EXPECT_INTRO: "contact" = the person who will make the intro; "target" = the third party being introduced.
- Extract any person name (contact), third party (target), and company or project mentioned.
- Skip purely personal/non-business lines.

Return ONLY a JSON array. Each element:
{ "type": "<KEY>", "kind": "ACTION" | "INTEL", "rawText": "<original line>", "detail": "<short normalized phrasing>", "contact": <name or null>, "target": <name or null>, "company": <name or null> }`;

  let parsed = [];
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: getAnthropicKey() });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = msg.content?.[0]?.text?.trim() || '[]';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) parsed = [];
  } catch (e) {
    console.error('[extractNoteActions] Claude call failed:', e?.message ?? e);
    return [];
  }

  return parsed
    .filter(it => it && it.rawText)
    .map(it => {
      const type = VALID.has(it.type) ? it.type : 'OTHER';
      const kind = typeByKey.get(type)?.kind || (it.kind === 'INTEL' ? 'INTEL' : 'ACTION');
      const contactName = it.contact || null;
      return {
        kind,
        type,
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
}
