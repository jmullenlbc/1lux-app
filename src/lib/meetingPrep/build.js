/**
 * Building one Meeting Prep brief: gather the CRM facts, ask for talking
 * points, save both. Shared by the note's Prep tab and the before-the-meeting
 * sweep (/api/cron/meeting-prep), so a brief is waiting before the meeting.
 *
 * @returns { briefId } or { error, status }, error words are safe to show.
 */
import { gatherMeetingFacts } from '@/lib/meetingPrep/gather';
import { buildFactBlocks } from '@/lib/meetingPrep/brief';
import { draftTalkingPoints } from '@/lib/meetingPrep/talkingPoints';
import { budgetTotals } from '@/lib/meetingPrep/budgets';

export async function buildMeetingBrief(prisma, note, { userId = null } = {}) {
  let raw;
  try {
    raw = await gatherMeetingFacts(prisma, note.id, new Date(), { budgetFor: budgetTotals });
  } catch (e) {
    console.error('[meeting-prep] gather failed:', e?.message ?? e);
    return { error: 'Could not read the CRM just now, try again in a minute.', status: 503 };
  }
  if (!raw || raw.empty) {
    return { error: 'Link a company, project or person to this note first, so there is something to prep from.', status: 400 };
  }

  const facts = buildFactBlocks(raw, new Date());

  let points = [];
  let model = null;
  let aiError = null;
  try {
    ({ points, model } = await draftTalkingPoints(facts, note, { projectId: note.projectId || null, userId }));
  } catch (e) {
    console.error('[meeting-prep] talking points failed:', e?.message ?? e);
    aiError = /unreadable/.test(e?.message || '') ? 'the AI answer could not be read' : 'the AI step did not answer';
  }
  const status = points.length ? 'ok' : aiError ? 'error' : 'no_points';

  const briefId = await prisma.$transaction(async tx => {
    const brief = await tx.meetingBrief.create({
      data: {
        noteId: note.id,
        createdById: userId,
        status,
        model,
        error: aiError,
        facts: {
          create: facts.map(f => ({
            ref: f.ref, block: f.block, position: f.position, text: f.text,
            sourceKind: f.sourceKind, sourceId: f.sourceId,
          })),
        },
      },
      include: { facts: { select: { id: true, ref: true } } },
    });
    const idByRef = Object.fromEntries(brief.facts.map(f => [f.ref, f.id]));
    for (const [position, p] of points.entries()) {
      const factIds = [...new Set(p.refs.map(r => idByRef[r]).filter(Boolean))];
      if (!factIds.length) continue;
      await tx.meetingBriefPoint.create({
        data: {
          briefId: brief.id,
          position,
          text: p.text,
          citations: { create: factIds.map(factId => ({ factId })) },
        },
      });
    }
    return brief.id;
  });
  return { briefId };

}
