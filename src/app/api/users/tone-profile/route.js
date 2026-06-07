import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma }       from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';

// ── mbox parser ───────────────────────────────────────────────────────────────
// Extracts plain-text bodies from a .mbox file (string)
// Returns up to maxEmails sent messages, skipping automated/system emails.

function parseMbox(mboxText, maxEmails = 200) {
  const emails = [];
  const messages = mboxText.split(/^From /m).slice(1); // split on mbox record boundaries

  for (const raw of messages) {
    if (emails.length >= maxEmails) break;

    // Extract headers and body
    const headerEnd = raw.indexOf('\n\n');
    if (headerEnd === -1) continue;
    const headerBlock = raw.slice(0, headerEnd);
    const body        = raw.slice(headerEnd + 2).trim();

    // Parse key headers
    const from    = (headerBlock.match(/^From:\s*(.+)$/im)?.[1] || '').trim();
    const subject = (headerBlock.match(/^Subject:\s*(.+)$/im)?.[1] || '').trim();
    const date    = (headerBlock.match(/^Date:\s*(.+)$/im)?.[1] || '').trim();

    // Skip automated / system emails
    const skipSubjects = ['unsubscribe', 'auto-reply', 'out of office', 'no-reply',
                          'noreply', 'notification', 'alert', 'invoice', 'receipt',
                          'password', 'confirm', 'verification'];
    const subjectLower = subject.toLowerCase();
    if (skipSubjects.some(s => subjectLower.includes(s))) continue;

    // Strip HTML tags and decode basic entities
    let text = body
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    // Only keep emails with meaningful body (>50 chars after stripping)
    if (text.length < 50) continue;

    // Truncate very long emails
    if (text.length > 800) text = text.slice(0, 800) + '…';

    emails.push({ from, subject, date, body: text });
  }

  return emails;
}

// ── Tone analysis via Claude Sonnet ──────────────────────────────────────────

async function buildToneProfile(emails, userName) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: getAnthropicKey() });

  // Sample up to 50 emails for analysis — enough to capture voice without huge cost
  const sample = emails.slice(0, 50);
  const emailSamples = sample.map((e, i) =>
    `--- Email ${i + 1} ---\nSubject: ${e.subject}\n${e.body}`
  ).join('\n\n');

  const prompt = `You are analyzing the writing style of ${userName || 'a sales professional'} based on their sent emails. Extract a detailed voice and tone profile.

Here are ${sample.length} of their sent emails:

${emailSamples}

Analyze their writing style and return a JSON object with this exact structure:
{
  "summary": "2-3 sentence description of their overall voice and communication style",
  "formality": "casual | semi-formal | formal",
  "sentenceLength": "short | medium | long | mixed",
  "openers": ["3-5 example phrases they use to open emails (exact or paraphrased)"],
  "closers": ["3-5 example phrases they use to close / sign off"],
  "phrases": ["8-12 characteristic phrases, word choices, or expressions they use frequently"],
  "tone": ["3-5 adjectives that best describe their tone: e.g. direct, warm, collaborative, no-nonsense"],
  "avoids": ["3-5 things they clearly avoid: filler phrases, corporate-speak, etc."],
  "patterns": ["3-5 structural or stylistic patterns: e.g. gets to the point fast, always ends with a question, uses bullet points for lists"],
  "exampleOpener": "Write one example opening line in their voice for a follow-up email after a golf outing",
  "exampleClose": "Write one example closing line in their voice with a specific ask"
}

Return ONLY the JSON object. No preamble, no explanation.`;

  const msg = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1000,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = msg.content?.[0]?.text?.trim() || '{}';
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

// ── POST /api/users/tone-profile ─────────────────────────────────────────────
// Accepts multipart form with a .mbox file, parses it, builds tone profile,
// stores it on the authenticated user.

export async function POST(req) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get('file');

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const filename = file.name || '';
  if (!filename.endsWith('.mbox') && !filename.endsWith('.zip') && filename !== 'Sent.mbox') {
    // Allow both .mbox directly and any file (user might rename it)
    // We'll try to parse whatever they send
  }

  const text = await file.text();
  if (!text.startsWith('From ') && !text.includes('\nFrom ')) {
    return NextResponse.json({ error: 'File does not appear to be a valid .mbox file' }, { status: 400 });
  }

  // Parse the mbox
  const emails = parseMbox(text, 200);
  if (emails.length < 5) {
    return NextResponse.json({ error: `Only ${emails.length} valid sent emails found. Need at least 5 to build a tone profile.` }, { status: 400 });
  }

  // Build tone profile via Sonnet
  let profile;
  try {
    profile = await buildToneProfile(emails, user.name);
  } catch (e) {
    console.error('[tone-profile] Sonnet error:', e.message);
    return NextResponse.json({ error: 'AI analysis failed — try again' }, { status: 500 });
  }

  // Store on user
  await prisma.user.update({
    where: { id: user.id },
    data: {
      toneProfile:        JSON.stringify(profile),
      toneProfileBuiltAt: new Date(),
      toneProfileSource:  'gmail_mbox',
    },
  });

  return NextResponse.json({
    ok:           true,
    emailsAnalyzed: emails.length,
    profile,
  });
}

// ── GET /api/users/tone-profile ───────────────────────────────────────────────
// Returns the current user's tone profile

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const u = await prisma.user.findUnique({
    where:  { id: user.id },
    select: { toneProfile: true, toneProfileBuiltAt: true, toneProfileSource: true, name: true },
  });

  if (!u?.toneProfile) return NextResponse.json({ profile: null });

  try {
    return NextResponse.json({
      profile:   JSON.parse(u.toneProfile),
      builtAt:   u.toneProfileBuiltAt,
      source:    u.toneProfileSource,
      userName:  u.name,
    });
  } catch {
    return NextResponse.json({ profile: null });
  }
}

// ── DELETE /api/users/tone-profile ───────────────────────────────────────────
export async function DELETE() {
  const { user, error } = await requireAuth();
  if (error) return error;
  await prisma.user.update({
    where: { id: user.id },
    data:  { toneProfile: null, toneProfileBuiltAt: null, toneProfileSource: null },
  });
  return NextResponse.json({ ok: true });
}
