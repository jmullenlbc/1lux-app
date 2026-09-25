/**
 * Learning from the edits people make to bot emails (Mike 9-25: "The system
 * needs to learn from the email edits too").
 *
 * Every recap and check-in draft keeps the words the bot first wrote
 * (BotDraft.aiSubject / aiBody, migration 0101). When a person changes them and
 * the email goes out, that pair — what the bot wrote, what was actually sent —
 * is shown to the writer the next time it drafts the same kind of email, so the
 * next draft starts closer to how Mike writes. Nothing is summarised or stored
 * twice: the sent emails ARE the lesson.
 *
 * Pure apart from editExamples(), which takes prisma as an argument.
 */

export const EMAIL_KINDS = { RECAP: 'RECAP', CHECK_IN: 'CHECK_IN' };

const SENT = ['SENT', 'MANUALLY_SENT'];
const MAX_CHARS = 1500;

// The meeting word for a subject line. Mike 9-25: the recap is approved when
// somebody gets to it — maybe two days later — so the subject names the
// meeting, never the day ("Coffee follow-up", not "Great meeting today").
const MEETING_WORDS = {
  COFFEE: 'Coffee', HAPPY_HOUR: 'Happy hour', GOLF: 'Golf', SITE_VISIT: 'Site visit',
  CALL: 'Call', EVENT: 'Event',
};

export function meetingWord(activityType, title = '') {
  if (activityType === 'MEAL') {
    const m = String(title).match(/\b(breakfast|brunch|lunch|dinner)\b/i);
    return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : 'Lunch';
  }
  return MEETING_WORDS[activityType] || 'Meeting';
}

export function followUpSubject(activityType, title) {
  return `${meetingWord(activityType, title)} follow-up`;
}

const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

/** True when a person changed the bot's words before the email went out. */
export function wasEdited(d) {
  if (!d?.aiBody) return false;
  return norm(d.body) !== norm(d.aiBody) || (d.aiSubject != null && norm(d.subject) !== norm(d.aiSubject));
}

/** The most recent sent emails of this kind that a person rewrote first. */
export async function editExamples(prisma, emailKind, limit = 4) {
  const rows = await prisma.botDraft.findMany({
    where:   { emailKind, aiBody: { not: null }, status: { in: SENT } },
    orderBy: { updatedAt: 'desc' },
    take:    40,
    select:  { subject: true, body: true, aiSubject: true, aiBody: true },
  });
  return rows.filter(wasEdited).slice(0, limit);
}

const clip = s => {
  const t = String(s || '').trim();
  return t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS)}…` : t;
};

/** Prompt block: before/after pairs, or '' when there are none yet. */
export function editExamplesSection(pairs) {
  if (!pairs?.length) return '';
  const shown = pairs.map((p, i) => `Example ${i + 1}
WHAT THE BOT WROTE:
Subject: ${p.aiSubject || p.subject}
${clip(p.aiBody)}
WHAT MIKE ACTUALLY SENT:
Subject: ${p.subject}
${clip(p.body)}`).join('\n\n');
  return `
Mike rewrote these earlier drafts before sending them. Study what he changed — length,
tone, greeting, sign-off, what he cut and what he added — and write the way he sends,
not the way the bot first wrote. Never copy their details into this email:
${shown}
`;
}
