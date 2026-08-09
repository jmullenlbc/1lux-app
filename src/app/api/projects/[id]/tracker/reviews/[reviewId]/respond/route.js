import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';

// CATEGORY_CONTEXT — hints to the model about what each category means
const CATEGORY_CONTEXT = {
  FINISH:        'finish/color/texture specification',
  MODEL:         'model number or cutsheet accuracy',
  ACCESSORY:     'required accessory or mounting hardware',
  VOLTAGE:       'voltage or electrical specification',
  LUMEN:         'lumen output or photometric performance',
  WET_LOCATION:  'wet/damp location listing requirement',
  DRAWING_SYNC:  'coordination with electrical/architectural drawings',
  DISCONTINUED:  'discontinued product replacement',
  LED_TAPE:      'LED tape specification',
  CODE:          'code compliance requirement',
  CRI:           'color rendering index (CRI) specification',
  BOILERPLATE:   'general submittal procedure',
  OTHER:         'general reviewer comment',
};

// POST — generate or regenerate AI response for a review
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Load full context for the prompt
  const review = await prisma.submittalReview.findUnique({
    where: { id: params.reviewId },
    include: {
      version: {
        include: {
          item: {
            include: {
              tracker: {
                include: { project: { select: { id: true, name: true } } },
              },
            },
          },
          submission: { select: { name: true } },
        },
      },
      response: true,
    },
  });

  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

  // Authorization: verify project matches
  const projectId = review.version.item.tracker.project.id;
  if (projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const project      = review.version.item.tracker.project;
  const typeCode     = review.version.item.typeCode;
  const manufacturer = review.version.manufacturer;
  const modelNumber  = review.version.modelNumber;
  const submission   = review.version.submission?.name;
  const catContext   = CATEGORY_CONTEXT[review.noteCategory] || 'reviewer comment';

  // Build Claude Haiku prompt
  const prompt = `You are ILC Studios, a professional lighting design and engineering firm, drafting a response to a submittal reviewer comment.

Project: ${project.name}
Submission: ${submission || 'R1'}
Fixture Type: ${typeCode}
${manufacturer ? `Manufacturer: ${manufacturer}` : ''}${modelNumber ? ` · ${modelNumber}` : ''}
Reviewer: ${review.reviewerRole}${review.reviewerName ? ` (${review.reviewerName})` : ''}
Review Status: ${review.status}
Comment Type: ${catContext}

The reviewer's comment itself follows below, inside the marked block.

Write a concise, professional ILC Studios response to that reviewer comment (1-3 sentences).

Rules:
- Directly address the specific concern raised
- Authoritative but collaborative tone — you are the lighting designer of record
- Reference the fixture type code (${typeCode}) if helpful
- Use standard submittal response language (e.g. "Acknowledged.", "ILC to coordinate...", "Resubmitting with...")
- Do NOT start with "Dear" or "Hello"
- Do NOT use generic filler — address the actual comment
- If the reviewer flagged something that needs action, state what ILC will do
- If it's informational/acknowledged, confirm understanding concisely

Respond with ONLY the response text. No subject line, no signature, no preamble.`;

  // The reviewer is an outside party — a city plan reviewer, an architect, a GC.
  // Their comment used to be interpolated straight into the prompt in quotes,
  // which is a delimiter a comment can close by typing a quote mark. It is now
  // fenced. This route drafts text that goes back out under ILC's name, so being
  // steered here has a real cost even though a human sends it.
  const sealed = buildUntrustedPrompt({
    instructions: prompt,
    documents:    [{ text: review.notes || '', descriptor: `reviewer comment (${review.reviewerRole})`, maxChars: 8000 }],
  });
  warnOnInjection('tracker.review.respond', params.id, sealed);

  let responseBody = '';
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    // Recorded: see src/lib/agent/ledger.js.
    const anthropic = wrapClient(
      new Anthropic({ apiKey: getAnthropicKey() }),
      'tracker.review.respond',
      { projectId: params.id, userId: user.id },
    );

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system:   sealed.system,
      messages: [{ role: 'user', content: sealed.content }],
    });

    responseBody = msg.content?.[0]?.text?.trim() || '';
  } catch (e) {
    console.error('Haiku response generation failed:', e.message);
    return NextResponse.json({ error: 'AI response generation failed. Try again.' }, { status: 500 });
  }

  // Upsert SubmittalResponse
  const response = await prisma.submittalResponse.upsert({
    where: { reviewId: params.reviewId },
    create: {
      reviewId:    params.reviewId,
      body:        responseBody,
      status:      'DRAFT',
      generatedBy: 'AI',
      createdById: user.id,
    },
    update: {
      body:        responseBody,
      status:      'DRAFT',
      generatedBy: 'AI',
      editedAt:    null,
    },
  });

  return NextResponse.json({ response });
}

// PATCH — update response body or status
export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existing = await prisma.submittalResponse.findUnique({
    where: { reviewId: params.reviewId },
    include: { review: { include: { version: { include: { item: { include: { tracker: true } } } } } } },
  });

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.review.version.item.tracker.projectId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const { responseBody, status } = body;

  const updated = await prisma.submittalResponse.update({
    where: { reviewId: params.reviewId },
    data: {
      ...(responseBody !== undefined && { body: responseBody, editedAt: new Date() }),
      ...(status === 'APPROVED' && { status: 'APPROVED', approvedAt: new Date() }),
      ...(status === 'DRAFT'    && { status: 'DRAFT', approvedAt: null }),
    },
  });

  return NextResponse.json({ response: updated });
}
