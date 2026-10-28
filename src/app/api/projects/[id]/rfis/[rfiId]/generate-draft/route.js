import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { extractFixtureTypes } from '@/lib/extractFixtureTypes';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';
import { stripDashes } from '@/lib/bot/emailStyle';

// POST /api/projects/[id]/rfis/[rfiId]/generate-draft
// Assembles context, determines confidence tier, calls Claude, writes draft to DB.
// Called automatically when RFI detail page opens with draftStatus='NONE'.
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const rfi = await prisma.rFI.findFirst({
    where:   { id: params.rfiId, projectId: params.id },
    include: {
      assignedTo: { select: { name: true } },
      activities: { where: { direction: 'INBOUND' }, orderBy: { sentAt: 'asc' }, take: 1 },
    },
  });
  if (!rfi) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Mark as GENERATING immediately
  await prisma.rFI.update({
    where: { id: rfi.id },
    data:  { draftStatus: 'GENERATING' },
  });

  const questionText = rfi.activities[0]?.bodyText || rfi.subject;
  const searchText   = rfi.subject + ' ' + questionText;

  // ── STEP 1: Context Assembly ────────────────────────────────────────────────
  const matchedTypes = await extractFixtureTypes(searchText, params.id, prisma);

  // LOW confidence fast-path for types that can't be drafted
  const forceLow = rfi.rfiType === 'ILC_INITIATED' || rfi.routingMode === 'REVIEW_ONLY';
  if (forceLow || matchedTypes.length === 0) {
    await prisma.rFI.update({
      where: { id: rfi.id },
      data: { draftStatus: 'READY', draftText: null, draftConfidence: 'LOW', draftGeneratedAt: new Date() },
    });
    return NextResponse.json({ ok: true, confidence: 'LOW' });
  }

  // Fetch fixture schedule data for matched types
  const schedules = await prisma.fixtureSchedule.findMany({
    where: { projectId: params.id }, select: { id: true },
  });
  const scheduleIds = schedules.map(s => s.id);

  const fixtureData = await Promise.all(matchedTypes.map(async typeCode => {
    const item = await prisma.fixtureScheduleItem.findFirst({
      where:  { scheduleId: { in: scheduleIds }, type: typeCode },
      select: { type: true, description: true, manufacturer: true, catalogNumber: true,
                mounting: true, dimming: true, voltage: true, cct: true, lumens: true,
                drawingSheetReference: true },
    });

    // Check active shipment
    const shipItem = await prisma.shipmentLineItem.findFirst({
      where:   { fixtureType: typeCode, shipment: { project_id: params.id } },
      select:  { esdDate: true, fixtureStatus: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      type:          typeCode,
      description:   item?.description   ?? null,
      manufacturer:  item?.manufacturer  ?? null,
      catalogNumber: item?.catalogNumber ?? null,
      mounting:      item?.mounting      ?? null,
      drawingSheet:  item?.drawingSheetReference ?? null,
      dimming:       item?.dimming       ?? null,
      voltage:       item?.voltage       ?? null,
      cct:           item?.cct           ?? null,
      shipEsd:       shipItem?.esdDate   ?? null,
      shipStatus:    shipItem?.fixtureStatus ?? null,
      score: (item?.mounting ? 2 : 0) +
             (item?.catalogNumber ? 1 : 0) +
             (item?.drawingSheetReference ? 1 : 0) +
             (!rfi.shipFlag ? 1 : 0) +
             (item?.manufacturer ? 1 : 0),
    };
  }));

  // ── STEP 2: Confidence Tier ─────────────────────────────────────────────────
  let confidence;
  if (rfi.rfiType === 'SUBSTITUTION') {
    confidence = 'SUBSTITUTION';
  } else {
    const minScore = Math.min(...fixtureData.map(f => f.score));
    if (minScore >= 6)     confidence = 'HIGH';
    else if (minScore >= 3) confidence = 'MEDIUM';
    else                   confidence = 'LOW';
  }

  if (confidence === 'LOW') {
    await prisma.rFI.update({
      where: { id: rfi.id },
      data: { draftStatus: 'READY', draftText: null, draftConfidence: 'LOW', draftGeneratedAt: new Date() },
    });
    return NextResponse.json({ ok: true, confidence: 'LOW' });
  }

  // ── STEP 3 to 4: Claude API Call ───────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const designerName = rfi.assignedTo?.name ?? 'ILC STUDIOS';

  const contextJson = JSON.stringify({
    projectName:   (await prisma.project.findUnique({ where: { id: params.id }, select: { name: true } }))?.name ?? '',
    designerName,
    rfiNumber:     rfi.rfiNumber,
    rfiType:       rfi.rfiType,
    routingMode:   rfi.routingMode,
    questionText,
    date:          today,
    fixtures:      fixtureData,
    shipFlag:      rfi.shipFlag,
    confidence,
  }, null, 2);

  const isReviewOnly = rfi.routingMode === 'REVIEW_ONLY';

  const systemPrompt = isReviewOnly
    ? `You are a lighting consultant reviewing drawings prepared by another designer.
Write a professional review comment in sentence case (not uppercase).
Identify the issue, reference the drawing sheet, and state what correction or clarification is needed.
Tone: collaborative and technical. Do not issue directives. Do not use ILC voice patterns.
End with: ${designerName} / ${today}`
    : `You are a lighting designer at ILC Studios drafting RFI responses.
Rules:
- Write in ALL CAPS, imperative voice.
- Never use hedging language (e.g. 'it appears', 'we believe', 'please consider').
- Always end with: ${designerName} / ${today}
- Reference specific fixture types, mounting heights, drawing sheets, and catalog numbers when available.
- For DIMENSION questions: state the exact AFF or dimension. If not in context, write: [VERIFY WITH CUT SHEET]
- For CLASH_RELOCATION: write: SEE ATTACHED MARKUP FOR REVISED FIXTURE LOCATIONS.
- For SUBSTITUTION: acknowledge the alternate, state acceptability clearly, note any conditions.
- For MULTI_QUESTION: respond to each numbered item separately. Number your responses to match.
- If information is missing, write [VERIFY: describe what to check]. Do not guess.
Generate ONLY the response text. No preamble. No explanations. No markdown.`;

  let draftText = null;

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    // Recorded: see src/lib/agent/ledger.js.
    const anthropic  = wrapClient(
      new Anthropic({ apiKey: (await getAnthropicKey()) }),
      'rfi.draft',
      { projectId: params.id, userId: user?.id || null },
    );

    // The context is ours, project data we assembled. The question is the
    // contractor's, so only it goes inside the fence. This route drafts text
    // that ILC signs and sends, which makes being steered here expensive even
    // though a human clicks send. See src/lib/agent/untrusted.js.
    const sealed = buildUntrustedPrompt({
      instructions: `Context:\n${contextJson}\n\nAnswer the RFI question in the marked block below.`,
      system:       systemPrompt,
      documents:    [{ text: questionText || '', descriptor: 'RFI question', maxChars: 8000 }],
    });
    warnOnInjection('rfi.draft', params.id, sealed);

    const msg = await anthropic.messages.create({
      ...modelParams('rfi.draft'),
      max_tokens: 1024,
      system:     sealed.system,
      messages:   [{ role: 'user', content: sealed.content }],
    });

    draftText = stripDashes(textFrom(msg)?.trim()) ?? null;

    // ── STEP 5: MULTI_QUESTION, parse per-item confidence ──────────────────
    if (rfi.rfiType === 'MULTI_QUESTION' && draftText) {
      const itemBlocks = draftText.split(/(?=^\d+\.\s)/m).filter(b => /^\d+\./.test(b.trim()));
      if (itemBlocks.length > 1) {
        const impactItems = itemBlocks.map((block, i) => {
          const hasVerify = /\[VERIFY/i.test(block);
          const hasSheet  = /EL-\d+|SHEET\s+\w+/i.test(block) || /AFF/i.test(block);
          const itemConf  = hasVerify ? 'LOW' : hasSheet ? 'HIGH' : 'MEDIUM';
          return {
            rfiId:         rfi.id,
            itemNumber:    i + 1,
            itemDraftText: block.trim(),
            itemConfidence: itemConf,
            impactStatus:  'PENDING',
          };
        });

        await prisma.rFIImpactItem.createMany({
          data: impactItems,
          skipDuplicates: true,
        });

        // Overall confidence = worst item
        const worstItem = impactItems.find(i => i.itemConfidence === 'LOW')
          ?? impactItems.find(i => i.itemConfidence === 'MEDIUM');
        if (worstItem?.itemConfidence === 'LOW') confidence = 'LOW';
        else if (worstItem?.itemConfidence === 'MEDIUM' && confidence === 'HIGH') confidence = 'MEDIUM';
      }
    }
  } catch (e) {
    console.error('RFI generate-draft AI error:', e.message);
    await prisma.rFI.update({
      where: { id: rfi.id },
      data: { draftStatus: 'NONE' },
    });
    return NextResponse.json({ error: 'AI generation failed', detail: e.message }, { status: 500 });
  }

  // ── STEP 6: Write draft to DB ───────────────────────────────────────────────
  await prisma.rFI.update({
    where: { id: rfi.id },
    data: {
      draftText,
      draftStatus:      'READY',
      draftConfidence:  confidence,
      draftGeneratedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, confidence });
}
