/**
 * The voice library (Mike 9-26): every email a salesperson uploads is kept as
 * a VoiceSample row, and their tone profile is rebuilt from the whole library.
 * The email writers read both the profile and a few of the real emails.
 *
 * Server only.
 */
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom, answerBudget } from '@/lib/aiModels';
import { MAX_BODY, sampleHash } from '@/lib/tone/mbox';
import { pickWeighted, AGE_BANDS, UNDATED } from '@/lib/tone/voiceAge';
import { periodStats, topPhrases, recurringEmails } from '@/lib/tone/voiceInsights';

const ACTIVE = { archivedAt: null, batch: { archivedAt: null } };

/** Clean what the browser sent: subject, body, optional date. */
export function cleanEmails(list, max = 500) {
  return (Array.isArray(list) ? list : []).slice(0, max).map(e => ({
    subject: String(e?.subject || '').slice(0, 200),
    body:    String(e?.body || '').slice(0, MAX_BODY + 1).trim(),
    sentAt:  Number(e?.date) > 0 ? new Date(Number(e.date)) : null,
  })).filter(e => e.body.length >= 40);
}

/**
 * Add one upload to a person's library. Emails already in it are skipped.
 * Returns { batch, added, skipped }.
 */
export async function addVoiceBatch({ userId, uploadedById, fileName, source, emails }) {
  const rows = emails.map(e => ({ ...e, hash: sampleHash(e.subject, e.body) }));
  const unique = [...new Map(rows.map(r => [r.hash, r])).values()];
  const found = await prisma.voiceSample.findMany({
    where: { userId, hash: { in: unique.map(r => r.hash) } },
    select: { id: true, hash: true, archivedAt: true, batch: { select: { archivedAt: true } } },
  });
  const existing = new Set(found.map(r => r.hash));
  // An email already here but put away (its upload archived) comes back into
  // this upload, so re-adding a file that was put away teaches again.
  const revive = found.filter(r => r.archivedAt || r.batch?.archivedAt).map(r => r.id);
  const fresh = unique.filter(r => !existing.has(r.hash));
  const added = fresh.length + revive.length;
  // No skipDuplicates: it throws on SQLite. Duplicates were filtered above.
  const batch = await prisma.voiceBatch.create({
    data: { userId, uploadedById: uploadedById || null, fileName: fileName ? String(fileName).slice(0, 200) : null, source, emailsAdded: added },
  });
  if (fresh.length) {
    await prisma.voiceSample.createMany({
      data: fresh.map(r => ({ userId, batchId: batch.id, subject: r.subject, body: r.body, sentAt: r.sentAt, hash: r.hash })),
    });
  }
  if (revive.length) {
    await prisma.voiceSample.updateMany({ where: { id: { in: revive } }, data: { batchId: batch.id, archivedAt: null } });
  }
  return { batch, added, skipped: rows.length - added };
}

export async function activeSampleCount(userId) {
  return prisma.voiceSample.count({ where: { userId, ...ACTIVE } });
}

/**
 * A few of the person's real emails for the writer to imitate: recent, mid
 * length (a one-liner teaches nothing, a long proposal is not a follow-up).
 */
export async function voiceSamplesFor(userId, n = 4) {
  if (!userId) return [];
  try {
    const rows = await prisma.voiceSample.findMany({
      where: { userId, ...ACTIVE },
      orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
      take: 60,
      select: { subject: true, body: true },
    });
    const mid = rows.filter(r => r.body.length >= 120 && r.body.length <= 700);
    return (mid.length >= n ? mid : rows).slice(0, n);
  } catch (e) {
    console.error('[voice] samples lookup failed:', e?.message ?? e);
    return [];
  }
}

const STUDY = 60;           // emails the model reads to learn the voice
const LIBRARY_READ = 6000;  // newest emails counted for phrases, stats and templates

/**
 * The whole active library as { subject, body, date }, newest first. An email
 * with no date (pasted) counts from the day it was added.
 */
async function libraryRows(userId) {
  const rows = await prisma.voiceSample.findMany({
    where: { userId, ...ACTIVE },
    orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
    take: LIBRARY_READ,
    select: { subject: true, body: true, sentAt: true, createdAt: true },
  });
  return rows.map(r => ({ subject: r.subject, body: r.body, date: new Date(r.sentAt || r.createdAt).getTime() || 0 }));
}

/**
 * Everything the Voice screen counts (Mike 9-27): how much each period counts,
 * how the writing changed period by period, the top 10 phrases.
 */
export async function voiceInsights(userId) {
  try {
    const rows = await libraryRows(userId);
    const now = Date.now();
    return {
      plan: pickWeighted(rows, STUDY, { now }).plan,
      periods: periodStats(rows, { now }),
      phrases: topPhrases(rows, { now, n: 10 }),
    };
  } catch (e) {
    console.error('[voice] insights failed:', e?.message ?? e);
    return null;
  }
}

const LABEL = Object.fromEntries([...AGE_BANDS, UNDATED].map(b => [b.key, b]));
const month = t => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'no date');

async function askJson(job, budget, prompt, userId) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = wrapClient(new Anthropic({ apiKey: getAnthropicKey() }), `${job}.build`, { userId });
  const msg = await client.messages.create({
    ...modelParams(job),
    max_tokens: answerBudget(job, budget),
    messages: [{ role: 'user', content: prompt }],
  });
  const raw = (textFrom(msg) || '').replace(/```json|```/g, '').trim();
  const open = raw.search(/[[{]/);
  const close = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
  return JSON.parse(raw.slice(open, close + 1));
}

/**
 * Rebuild one person's tone profile from their whole active library and store
 * it on User.toneProfile. Newer emails count more (voiceAge.js): the profile
 * describes how they write NOW, and says how that changed from before (Mike
 * 9-27). Also refreshes their template suggestions.
 * Returns { profile, emailsAnalyzed, libraryCount } or { error }.
 */
export async function rebuildToneProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!user) return { error: 'No such person' };
  const rows = await libraryRows(userId);
  if (rows.length < 5) {
    await prisma.user.update({ where: { id: userId }, data: { toneProfile: null, toneProfileBuiltAt: null, toneProfileSource: null } });
    return { error: `Only ${rows.length} emails in the library. Need at least 5 to learn a voice.`, emailsAnalyzed: rows.length };
  }
  const now = Date.now();
  const { picks, plan } = pickWeighted(rows, STUDY, { now });
  const periods = periodStats(rows, { now });
  const older = periods.filter(p => !['M3', 'M12', 'NONE'].includes(p.key)).reduce((n, p) => n + p.emails, 0);
  const hasHistory = older >= 5;

  let k = 0;
  const groups = plan.map(b => {
    const list = picks.filter(p => p.band === b.key);
    return `=== ${LABEL[b.key].label} (each email counts ${b.weight}x) ===\n`
      + list.map(e => `Email ${++k} (${month(e.date)})\nSubject: ${e.subject}\n${e.body}`).join('\n\n');
  }).join('\n\n');
  const table = periods.map(p => `${p.label}: ${p.emails} emails, ${p.avgWords} words on average, ${p.wordsPerSentence} words per sentence, `
    + `${p.questionPct}% ask a question, ${p.listPct}% use a list, ${p.softPerEmail} softening words per email`).join('\n');
  const ifHistory = (yes, no) => (hasHistory ? yes : no);

  const prompt = `You are studying how ${user.name || 'a salesperson'} writes email, from ${picks.length} emails they sent, grouped newest first.
They are getting better at wording things, so the newest emails show the voice to copy. Newer groups count more, as marked.
When older and newer emails differ, describe the NEWER way everywhere except in "then" and "evolution".

${groups}

Counted over their whole library (${rows.length} emails), by period:
${table}

Return a JSON object with exactly these keys:
{
  "summary": "3-4 plain sentences describing their voice as it is now: how they sound, how long they write, how they get to the point, what makes it theirs",
  "now": "one sentence: the single biggest thing about how they write today",
  "then": ${ifHistory('"one sentence: how they wrote in the oldest emails"', '""')},
  "evolution": ${ifHistory('["3-5 plain ways the writing changed from the oldest emails to the newest. Use the counted numbers where they help, e.g. about 90 words now, 160 three years ago"]', '[]')},
  "improved": ${ifHistory('["2-4 things that read stronger now than before"]', '[]')},
  "stillWorkingOn": ${ifHistory('["0-2 older habits that still show up in recent emails, only if real"]', '[]')},
  "formality": "casual | semi-formal | formal",
  "sentenceLength": "short | medium | long | mixed",
  "tone": ["3-5 adjectives"],
  "openers": ["4-6 greetings and first lines they really use now, copied as written"],
  "closers": ["4-6 closing lines and sign-offs they really use now, copied as written"],
  "phrases": ["8-12 phrases or expressions that sound like them now, copied as written"],
  "vocabulary": ["10-15 words they reach for often, including industry words"],
  "subjects": ["6-8 of their real recent subject lines that best show their style, copied as written"],
  "subjectStyle": "one sentence on how they title emails: length, capitals, names, punctuation",
  "avoids": ["3-5 things they never do"],
  "patterns": ["3-5 habits of structure: bullets, questions, one-liners, how they ask for things"]
}
Copy their words exactly where asked. Write plainly for a salesperson, not a linguist.
Never use an em dash, en dash or double dash in your answer.
Return ONLY the JSON object.`;

  const [profile] = await Promise.all([
    askJson('user.toneProfile', 2600, prompt, userId),
    refreshTemplateSuggestions(user, rows, now).catch(e => console.error('[voice] template suggestions failed:', e?.message ?? e)),
  ]);
  await prisma.user.update({
    where: { id: userId },
    data: { toneProfile: JSON.stringify(profile), toneProfileBuiltAt: new Date(), toneProfileSource: 'voice_library' },
  });
  return { profile, emailsAnalyzed: picks.length, libraryCount: rows.length };
}

const PLACEHOLDERS = ['contactFirstName', 'companyName', 'projectName', 'senderName'];

/**
 * Emails a person writes over and over become template suggestions. The
 * groups are found by counting (voiceInsights.recurringEmails); the model only
 * writes each one up in their own current words. Old suggestions are marked
 * REPLACED, never deleted; saved and "not useful" ones are not suggested again.
 */
async function refreshTemplateSuggestions(user, rows, now) {
  const groups = recurringEmails(rows, { now });
  const decided = await prisma.voiceTemplateSuggestion.findMany({
    where: { userId: user.id, status: { in: ['SAVED', 'DISMISSED'] } },
    select: { name: true }, take: 100,
  });
  let written = [];
  if (groups.length) {
    const prompt = `${user.name || 'A salesperson'} sends these kinds of emails over and over. Each group below holds their newest examples of one kind.

${groups.map((g, i) => `### Group ${i + 1}: sent ${g.size} times, ${g.recent} in the last year\n`
    + g.examples.map((e, j) => `Example ${j + 1}\nSubject: ${e.subject}\n${e.body}`).join('\n\n')).join('\n\n')}

${decided.length ? `Already handled, do not suggest these again:\n${decided.map(d => `- ${d.name}`).join('\n')}\n\n` : ''}For each group worth a reusable template, write one in THEIR words as they write now (the examples are newest first).
Use these placeholders where the examples change from email to email: ${PLACEHOLDERS.map(p => `{${p}}`).join(', ')}.
Use [square brackets] for anything else a person must fill in, e.g. [date], [number of units].
Skip a group that is automatic mail, a one-off, or too personal to reuse.
No signature block at the end; it is added to every email anyway.

Return a JSON array, best first:
[{ "group": 1, "name": "short name, e.g. Proposal follow-up", "whenToUse": "one sentence", "subject": "subject line", "body": "the email" }]
Never use an em dash, en dash or double dash. Return ONLY the JSON array.`;
    const out = await askJson('user.voiceTemplates', 3200, prompt, user.id);
    written = (Array.isArray(out) ? out : []).filter(t => groups[Number(t?.group) - 1] && String(t?.body || '').trim());
  }
  await prisma.voiceTemplateSuggestion.updateMany({ where: { userId: user.id, status: 'SUGGESTED' }, data: { status: 'REPLACED' } });
  for (const t of written.slice(0, 8)) {
    const g = groups[Number(t.group) - 1];
    await prisma.voiceTemplateSuggestion.create({
      data: {
        userId: user.id,
        name: String(t.name || 'Template').slice(0, 120),
        whenToUse: String(t.whenToUse || '').slice(0, 500),
        subject: String(t.subject || '').slice(0, 200),
        body: String(t.body).slice(0, 4000),
        basedOn: g.size,
        recentCount: g.recent,
        lastSentAt: g.lastSentAt ? new Date(g.lastSentAt) : null,
      },
    });
  }
}

/** A person's template suggestions (live, saved and "not useful"), most used first. */
export async function templateSuggestions(userId) {
  return prisma.voiceTemplateSuggestion.findMany({
    where: { userId, status: { in: ['SUGGESTED', 'SAVED', 'DISMISSED'] } },
    orderBy: [{ basedOn: 'desc' }, { createdAt: 'desc' }],
    take: 60,
    select: { id: true, name: true, whenToUse: true, subject: true, body: true, basedOn: true, recentCount: true,
      lastSentAt: true, status: true, messageTemplateId: true, decidedAt: true },
  });
}

/** The {placeholders} a template uses, for MessageTemplate.variables. */
export const templateVariables = body => [...new Set([...String(body).matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
