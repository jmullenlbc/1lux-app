/**
 * Unit Selections, the part that needs rows.
 *
 * Everything that can be decided without a database lives in engine.js and is
 * re-exported from here, so the rest of the app imports one place:
 *
 *   import { resolveFacts, eligibleOptions } from '@/lib/unitSelections';
 *
 * Keep it that way. The moment engine.js needs prisma, the unit tests stop
 * running under plain Node and the 6'-8" rule goes untested.
 */
import { prisma } from '@/lib/db';
import { PRICING } from '@/lib/pricing';
import { pricingForProject } from '@/lib/pricingLoader';
import { CATEGORIES, deriveFacts } from './engine.js';

export * from './engine.js';

/**
 * What a real project has already decided.
 *
 * Reads the design questionnaire, the project's frozen pricing snapshot and the
 * client's standing type targets. Never writes anything.
 *
 * @param {string} projectId
 * @param {object} [overrides] typed on the survey: {targets, entryMountHigh, islandLength}
 */
export async function resolveFacts(projectId, overrides = {}) {
  const [responses, project] = await Promise.all([
    prisma.questionnaireResponse.findMany({ where: { projectId } }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, pricingSnapshot: true },
    }),
  ]);

  const answers = {};
  for (const r of responses) {
    (answers[r.section] ||= {})[r.questionKey] = r.answerValue;
  }

  // The frozen snapshot, with any pricing key added after the freeze filled in
  // from the master sheet — a zero there would read as "this is free".
  const pricing = pricingForProject(project?.pricingSnapshot, PRICING);

  const clientTargets = {};
  if (project?.clientId) {
    const fixtures = await prisma.clientStandardFixture.findMany({
      where: {
        clientId: project.clientId,
        typeCode: { in: CATEGORIES.map(c => c.typeCode) },
      },
      select: { typeCode: true, priceTarget: true },
    });
    for (const f of fixtures) {
      if (f.priceTarget != null) clientTargets[String(f.typeCode).toUpperCase()] = f.priceTarget;
    }
  }

  return deriveFacts({ answers, pricing, clientTargets, overrides });
}

/** The fields every screen and route wants back for one person's answers. */
export const RESPONSE_SHAPE = {
  id: true, respondentName: true, respondentRole: true, contactId: true,
  styleChoice: true, finishOverride: true, fanHoldWhite: true, notes: true,
  startedAt: true, submittedAt: true, createdAt: true,
  choices: { select: { id: true, category: true, optionId: true, kind: true, finishKey: true } },
};

/**
 * One person's answers, but only if this user is allowed to see the job it
 * hangs off. Returns null for both "not there" and "not yours", so a caller
 * cannot accidentally tell a stranger which response ids exist.
 *
 * Lives here rather than in a route file because two routes need it and a
 * Next.js route file may only export HTTP methods.
 */
export async function loadResponseForUser(responseId, user, canSeeAll) {
  const response = await prisma.unitSelectionResponse.findUnique({
    where: { id: responseId },
    select: {
      ...RESPONSE_SHAPE,
      survey: {
        select: { id: true, status: true, project: { select: { id: true, createdById: true } } },
      },
    },
  });
  if (!response) return null;
  if (!canSeeAll && response.survey?.project?.createdById !== user?.id) return null;
  return response;
}
