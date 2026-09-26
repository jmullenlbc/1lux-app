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

/** Evenly spread picks, so one busy week does not become the whole profile. */
function spread(rows, n) {
  if (rows.length <= n) return rows;
  const step = rows.length / n;
  return Array.from({ length: n }, (_, i) => rows[Math.floor(i * step)]);
}

/**
 * Rebuild one person's tone profile from their whole active library and store
 * it on User.toneProfile. Returns { profile, emailsAnalyzed } or { error }.
 */
export async function rebuildToneProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!user) return { error: 'No such person' };
  const rows = await prisma.voiceSample.findMany({
    where: { userId, ...ACTIVE },
    orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
    take: 400,
    select: { subject: true, body: true },
  });
  if (rows.length < 5) {
    await prisma.user.update({ where: { id: userId }, data: { toneProfile: null, toneProfileBuiltAt: null, toneProfileSource: null } });
    return { error: `Only ${rows.length} emails in the library. Need at least 5 to learn a voice.`, emailsAnalyzed: rows.length };
  }
  const sample = spread(rows, 60);
  const emailSamples = sample.map((e, i) => `Email ${i + 1}\nSubject: ${e.subject}\n${e.body}`).join('\n\n');

  const prompt = `You are studying how ${user.name || 'a salesperson'} writes email, from ${sample.length} emails they sent.

${emailSamples}

Return a JSON object with exactly these keys:
{
  "summary": "2-3 sentences on their voice: how they sound, how long they write, how they get to the point",
  "formality": "casual | semi-formal | formal",
  "sentenceLength": "short | medium | long | mixed",
  "tone": ["3-5 adjectives"],
  "openers": ["4-6 greetings and first lines they really use, copied as written"],
  "closers": ["4-6 closing lines and sign-offs they really use, copied as written"],
  "phrases": ["8-12 phrases or expressions that sound like them, copied as written"],
  "vocabulary": ["10-15 words they reach for often, including industry words"],
  "subjects": ["6-8 of their real subject lines that best show their style, copied as written"],
  "subjectStyle": "one sentence on how they title emails: length, capitals, names, punctuation",
  "avoids": ["3-5 things they never do"],
  "patterns": ["3-5 habits of structure: bullets, questions, one-liners, how they ask for things"]
}
Copy their words exactly where asked. Never use an em dash, en dash or double dash in your answer.
Return ONLY the JSON object.`;

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = wrapClient(new Anthropic({ apiKey: getAnthropicKey() }), 'user.toneProfile.build', { userId });
  const msg = await client.messages.create({
    ...modelParams('user.toneProfile'),
    max_tokens: answerBudget('user.toneProfile', 1800),
    messages: [{ role: 'user', content: prompt }],
  });
  const raw = (textFrom(msg) || '{}').replace(/```json|```/g, '').trim();
  const profile = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  await prisma.user.update({
    where: { id: userId },
    data: { toneProfile: JSON.stringify(profile), toneProfileBuiltAt: new Date(), toneProfileSource: 'voice_library' },
  });
  return { profile, emailsAnalyzed: sample.length, libraryCount: rows.length };
}
