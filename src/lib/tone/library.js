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
import { periodStats, topSentences, personalLines, recurringEmails } from '@/lib/tone/voiceInsights';
import { autoMailReason, findAutoMail, stripAwayLines, isAwaySentence, isAwayTemplate } from '@/lib/tone/autoMail';
import { INTERVIEW_SOURCE } from '@/lib/tone/interview';
import { topicOverlap, sharedWords } from '@/lib/bot/templateMatch';

const ACTIVE = { archivedAt: null, batch: { archivedAt: null } };

/**
 * Clean what the browser sent: subject, body, optional date. Out-of-office
 * replies and calendar mail never get in, whatever the browser sent (Mike 9-30),
 * and away or focus-time sentences are taken out of every other email (Mike
 * 10-1). The hash is of the email as sent, so the same email uploaded again is
 * still found.
 */
export function cleanEmails(list, max = 500) {
  return (Array.isArray(list) ? list : []).slice(0, max).map(e => {
    const subject = String(e?.subject || '').slice(0, 200);
    const sent = String(e?.body || '').slice(0, MAX_BODY + 1).trim();
    return { subject, body: stripAwayLines(sent), hash: sampleHash(subject, sent),
      sentAt: Number(e?.date) > 0 ? new Date(Number(e.date)) : null, auto: autoMailReason({ subject, body: sent }) };
  }).filter(e => e.body.length >= 40 && !e.auto).map(({ auto, ...e }) => e);
}

/**
 * Add one upload to a person's library. Emails already in it are skipped.
 * Returns { batch, added, skipped }.
 */
export async function addVoiceBatch({ userId, uploadedById, fileName, source, emails }) {
  const rows = emails.map(e => ({ ...e, hash: e.hash || sampleHash(e.subject, e.body) }));
  const unique = [...new Map(rows.map(r => [r.hash, r])).values()];
  const found = await prisma.voiceSample.findMany({
    where: { userId, hash: { in: unique.map(r => r.hash) } },
    select: { id: true, hash: true, archivedAt: true, archiveReason: true, batch: { select: { archivedAt: true } } },
  });
  const existing = new Set(found.map(r => r.hash));
  // An email already here but put away (its upload archived) comes back into
  // this upload, so re-adding a file that was put away teaches again. One set
  // aside as automatic mail stays aside; only "Put back" returns it.
  const autoAside = r => r.archivedAt && ['OUT_OF_OFFICE', 'CALENDAR'].includes(r.archiveReason);
  const revive = found.filter(r => (r.archivedAt || r.batch?.archivedAt) && !autoAside(r)).map(r => r.id);
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

/**
 * Re-reads the saved library and sets aside every out-of-office reply and
 * calendar email (Mike 9-30: "reanalyze all those emails and pull out all the
 * auto-generated out of office replies ... any send or response for calendar
 * invites"). Archive-only: archiveReason says why, "Put back" undoes it, and
 * one put back (KEPT) is never set aside again. Runs before every relearn.
 * Then takes every away or focus-time sentence out of the emails left (Mike
 * 10-1: "Remove all from the system retroactively"); an email that was little
 * more than that is set aside as out of office. The hash is left alone so a
 * re-upload of the same email is still found.
 * Returns { OUT_OF_OFFICE: n, CALENDAR: n, STRIPPED: n }.
 */
export async function putAsideAutoMail(userId) {
  const done = { OUT_OF_OFFICE: 0, CALENDAR: 0, STRIPPED: 0 };
  const rows = await prisma.voiceSample.findMany({
    where: { userId, archivedAt: null, archiveReason: null },
    select: { id: true, subject: true, body: true },
  });
  const found = findAutoMail(rows);
  const now = new Date();
  for (const reason of Object.keys(done)) {
    const ids = [...found].filter(([, r]) => r === reason).map(([id]) => id);
    for (let i = 0; i < ids.length; i += 500) {
      await prisma.voiceSample.updateMany({ where: { id: { in: ids.slice(i, i + 500) } }, data: { archivedAt: now, archiveReason: reason } });
    }
    done[reason] = ids.length;
  }

  const live = await prisma.voiceSample.findMany({
    where: { userId, archivedAt: null },
    select: { id: true, body: true },
  });
  const changed = live.map(r => ({ id: r.id, body: stripAwayLines(r.body), was: r.body })).filter(r => r.body !== r.was);
  const short = changed.filter(r => r.body.length < 40).map(r => r.id);
  for (let i = 0; i < short.length; i += 500) {
    await prisma.voiceSample.updateMany({ where: { id: { in: short.slice(i, i + 500) } }, data: { archivedAt: now, archiveReason: 'OUT_OF_OFFICE' } });
  }
  done.OUT_OF_OFFICE += short.length;
  const trim = changed.filter(r => r.body.length >= 40);
  for (let i = 0; i < trim.length; i += 25) {
    await Promise.all(trim.slice(i, i + 25).map(r => prisma.voiceSample.update({ where: { id: r.id }, data: { body: r.body } })));
  }
  done.STRIPPED = trim.length;

  // Template suggestions written from away mail are retired too; a saved one
  // is switched off in the email templates (reversible), never deleted.
  const tpl = await prisma.voiceTemplateSuggestion.findMany({
    where: { userId, status: { in: ['SUGGESTED', 'SAVED', 'DISMISSED'] } },
    select: { id: true, subject: true, body: true, messageTemplateId: true },
  });
  const away = tpl.filter(t => isAwayTemplate(t));
  if (away.length) {
    await prisma.voiceTemplateSuggestion.updateMany({ where: { id: { in: away.map(t => t.id) } }, data: { status: 'REPLACED' } });
    const saved = away.map(t => t.messageTemplateId).filter(Boolean);
    if (saved.length) await prisma.messageTemplate.updateMany({ where: { id: { in: saved } }, data: { isActive: false } });
  }
  return done;
}

/** The automatic mail set aside, newest first, for the Voice screen. */
export async function autoSetAside(userId, take = 100) {
  const where = { userId, archivedAt: { not: null }, archiveReason: { in: ['OUT_OF_OFFICE', 'CALENDAR'] } };
  const [counts, rows] = await Promise.all([
    prisma.voiceSample.groupBy({ by: ['archiveReason'], where, _count: { _all: true } }),
    prisma.voiceSample.findMany({
      where, orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }], take,
      select: { id: true, subject: true, body: true, sentAt: true, archiveReason: true },
    }),
  ]);
  return {
    counts: Object.fromEntries(counts.map(c => [c.archiveReason, c._count._all])),
    items: rows.map(r => ({ id: r.id, subject: r.subject, reason: r.archiveReason, sentAt: r.sentAt, snippet: r.body.slice(0, 160) })),
  };
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

const STUDY = 250;          // emails the model reads to learn the voice (Mike 10-1: 60 was too limited)
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
    select: { subject: true, body: true, sentAt: true, createdAt: true, batch: { select: { source: true } } },
  });
  return rows.map(r => ({ subject: r.subject, body: r.body, date: new Date(r.sentAt || r.createdAt).getTime() || 0,
    asked: r.batch?.source === INTERVIEW_SOURCE }));
}

/**
 * Everything the Voice screen counts (Mike 9-27): how much each period counts,
 * how the writing changed period by period, the top 20 sentences (Mike 10-1:
 * "the top phrases should be top 20 sentences").
 */
export async function voiceInsights(userId) {
  try {
    const rows = await libraryRows(userId);
    const now = Date.now();
    return {
      plan: pickWeighted(rows, STUDY, { now }).plan,
      periods: periodStats(rows, { now }),
      sentences: topSentences(rows, { now, n: 20 }),
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
  const setAside = await putAsideAutoMail(userId);
  const rows = await libraryRows(userId);
  if (rows.length < 5) {
    await prisma.user.update({ where: { id: userId }, data: { toneProfile: null, toneProfileBuiltAt: null, toneProfileSource: null } });
    return { error: `Only ${rows.length} emails in the library. Need at least 5 to learn a voice.`, emailsAnalyzed: rows.length, setAside };
  }
  const now = Date.now();
  // Q&A answers (interview.js) are always read, ahead of the mailbox: the
  // person wrote them to show the bot exactly how they want to sound.
  const asked = rows.filter(r => r.asked).slice(0, 20);
  const { picks, plan } = pickWeighted(rows.filter(r => !r.asked), STUDY - asked.length, { now });
  const periods = periodStats(rows, { now });
  const older = periods.filter(p => !['M3', 'M12', 'NONE'].includes(p.key)).reduce((n, p) => n + p.emails, 0);
  const hasHistory = older >= 5;

  let k = 0;
  const askedGroup = asked.length
    ? `=== Written just now for this training, answering everyday sales situations. Weigh these MOST: they show how they want to sound today ===\n`
      + asked.map(e => `Email ${++k}\nSubject: ${e.subject}\n${e.body}`).join('\n\n') + '\n\n'
    : '';
  const groups = askedGroup + plan.map(b => {
    const list = picks.filter(p => p.band === b.key);
    return `=== ${LABEL[b.key].label} (each email counts ${b.weight}x) ===\n`
      + list.map(e => `Email ${++k} (${month(e.date)})\nSubject: ${e.subject}\n${e.body}`).join('\n\n');
  }).join('\n\n');
  const table = periods.map(p => `${p.label}: ${p.emails} emails, ${p.avgWords} words on average, ${p.wordsPerSentence} words per sentence, `
    + `${p.questionPct}% ask a question, ${p.listPct}% use a list, ${p.softPerEmail} softening words per email`).join('\n');
  const ifHistory = (yes, no) => (hasHistory ? yes : no);
  // Mike 10-1: "Pull out what kind of things I say in a personal way". Found
  // across the WHOLE library by counting, then sorted into kinds by the model.
  const personal = personalLines(rows, { now, max: 80 });

  const prompt = `You are studying how ${user.name || 'a salesperson'} writes email, from ${picks.length + asked.length} emails they wrote, grouped newest first.
They are getting better at wording things, so the newest emails show the voice to copy. Newer groups count more, as marked.
When older and newer emails differ, describe the NEWER way everywhere except in "then" and "evolution".

${groups}

Counted over their whole library (${rows.length} emails), by period:
${table}

Personal lines found across their whole library (family, weekends, trips, sports, congratulations, catching up), most used first:
${personal.length ? personal.map(x => `- ${x.sentence}${x.emails > 1 ? ` (in ${x.emails} emails)` : ''}`).join('\n') : '(none found)'}

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
  "patterns": ["3-5 habits of structure: bullets, questions, one-liners, how they ask for things"],
  "personal": [{ "kind": "short plain label for one kind of personal thing they say, e.g. Asks about family, Weekend wishes, Congratulates", "examples": ["2-3 of their real lines of this kind, copied as written"] }]
}
For "personal" give 3-8 kinds from the personal lines and the emails, most used first, or [] when they never get personal.
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
  return { profile, emailsAnalyzed: picks.length + asked.length, libraryCount: rows.length, setAside };
}

const PLACEHOLDERS = ['contactFirstName', 'companyName', 'projectName', 'senderName'];

/**
 * Emails a person writes over and over become template suggestions. The
 * groups are found by counting (voiceInsights.recurringEmails); the model only
 * writes each one up in their own current words. Old suggestions are marked
 * REPLACED, never deleted; saved and "not useful" ones are not suggested again.
 */
// A group is covered when a suggestion on the same topic already exists: the
// topic words match, or (rows from before 0112, no topic) the name shares two
// words with it. A covered group never comes back as a near-twin, so the open
// slots go to new kinds of email (Mike 10-1: "ever learning and ever refilling").
const SLOTS = 8;
function openGroups(found, decided) {
  return found.filter(g => !decided.some(d => (d.topic ? topicOverlap(g.topic, d.topic) >= 0.5 : sharedWords(g.topic, d.name) >= 2)));
}

/**
 * On Relearn: every suggestion still on screen is replaced by fresh ones. On a
 * refill (after a save or "not useful"): what is on screen stays and only the
 * empty slots are written, for groups no suggestion covers yet.
 */
async function refreshTemplateSuggestions(user, rows, now, { refill = false } = {}) {
  const decided = await prisma.voiceTemplateSuggestion.findMany({
    where: { userId: user.id, status: { in: refill ? ['SUGGESTED', 'SAVED', 'DISMISSED'] : ['SAVED', 'DISMISSED'] } },
    select: { name: true, topic: true, status: true }, take: 200,
  });
  const room = refill ? Math.max(0, SLOTS - decided.filter(d => d.status === 'SUGGESTED').length) : SLOTS;
  if (!room) return;
  const groups = openGroups(recurringEmails(rows, { now, max: SLOTS * 2 }), decided).slice(0, room);
  const handled = decided.length ? `Already handled, do not write one of these again:\n${decided.map(d => `- ${d.name}`).join('\n')}\n\n` : '';
  // One small call per group (Mike 10-1: none came back when all 8 were asked
  // for in one answer). A group that fails or is skipped never stops the rest.
  const one = (g, i) => askJson('user.voiceTemplates', 1500, `${user.name || 'A salesperson'} has sent ${g.size} emails on this one topic (${g.topic.join(', ')}), ${g.recent} in the last year. The wording differs from email to email. Their newest examples:

${g.examples.map((e, j) => `Example ${j + 1}\nSubject: ${e.subject}\n${stripAwayLines(e.body)}`).join('\n\n')}

The other groups are about: ${groups.filter(o => o !== g).map(o => o.topic.join(', ')).join('; ') || 'nothing else'}.
${handled}Write ONE reusable template for this kind of email in THEIR words as they write now (the examples are newest first).
Build it around what sets this group apart (${g.topic.join(', ')}), and name it for that, not a general name like "Budget update".
Use these placeholders where the examples change from email to email: ${PLACEHOLDERS.map(p => `{${p}}`).join(', ')}.
Use [square brackets] for anything else a person must fill in, e.g. [date], [number of units].
Never put an out-of-office, away, out sick, office closed, focus-time or calendar line in it. No signature block at the end; it is added to every email anyway.
Only when these are notices rather than real emails (out-of-office or away replies, out sick or office closed notices, calendar invites, accepts or declines) or one of the already handled ones, return { "skip": true }.

Return ONE JSON object: { "name": "short name, e.g. Proposal follow-up", "whenToUse": "one sentence", "subject": "subject line", "body": "the email" }
Never use an em dash, en dash or double dash. Return ONLY the JSON object.`, user.id)
    .then(t => (t && !t.skip && String(t.body || '').trim() && !isAwayTemplate(t) ? { ...t, group: i + 1 } : null))
    .catch(e => { console.error(`[voice] template for group ${i + 1} failed:`, e?.message ?? e); return null; });
  const names = new Set();
  const written = (await Promise.all(groups.map(one))).filter(Boolean)
    .filter(t => { const k = String(t.name || '').toLowerCase().trim(); if (names.has(k)) return false; names.add(k); return true; });
  if (groups.length && !written.length) console.error(`[voice] ${groups.length} groups but no templates written for user ${user.id}`);
  if (!refill) await prisma.voiceTemplateSuggestion.updateMany({ where: { userId: user.id, status: 'SUGGESTED' }, data: { status: 'REPLACED' } });
  for (const t of written.slice(0, room)) {
    const g = groups[Number(t.group) - 1];
    await prisma.voiceTemplateSuggestion.create({
      data: {
        userId: user.id,
        topic: g.topic.join(' ').slice(0, 200),
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
/**
 * After a suggestion is saved or put away (Mike 10-1: "a new one should take
 * its place"): writes templates for the next kinds of email not yet covered,
 * up to 8 on screen. Nothing on screen is replaced. Returns the list.
 */
export async function refillTemplateSuggestions(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!user) return [];
  const rows = await libraryRows(userId);
  if (rows.length >= 5) await refreshTemplateSuggestions(user, rows, Date.now(), { refill: true });
  return templateSuggestions(userId);
}

export async function templateSuggestions(userId) {
  return prisma.voiceTemplateSuggestion.findMany({
    where: { userId, status: { in: ['SUGGESTED', 'SAVED', 'DISMISSED'] } },
    orderBy: [{ basedOn: 'desc' }, { createdAt: 'desc' }],
    take: 60,
    select: { id: true, name: true, whenToUse: true, subject: true, body: true, topic: true, basedOn: true, recentCount: true,
      lastSentAt: true, status: true, messageTemplateId: true, decidedAt: true },
  });
}

/** The {placeholders} a template uses, for MessageTemplate.variables. */
export const templateVariables = body => [...new Set([...String(body).matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
