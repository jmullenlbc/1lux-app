/**
 * Making a new project — the one way. Used by the New Project form's API and
 * by "Create a project from this web request" in the review queue, so both get
 * the same project number, budget number, frozen pricing, 23% margin and
 * "created" history line.
 *
 * Server-only. The caller has already checked who is allowed and that there
 * is a name.
 */
import { INCLUDE_ARCHIVED } from '@/lib/archive';
import { loadPricing } from '@/lib/pricingLoader';
import { recordProjectCreated } from '@/lib/statusEvents';

const VALID_PHASES        = ['sd', 'dd', 'cd', 'ifc', 'construction', 'closeout'];
const VALID_SERVICE_TYPES = ['fullDesign', 'designAssist', 'peerReview', 'bidOnly', 'other'];

export async function createProject(db, userId, fields) {
  const { name, buildingType, location, contactEmail, contactName, budgetType, clientId, city, state, zip, phase, serviceType, projectType } = fields;

  const activePricing = await loadPricing();

  // Derive location string from city/state if provided
  const locationStr = city && state
    ? `${city}, ${state}`
    : (city || state || location || null);

  // Generate next projectNumber
  const agg = await db.project.aggregate({ _max: { projectNumber: true } });
  const projectNumber = (agg._max.projectNumber ?? 0) + 1;

  // Generate budget number (C00001 / D00001 / B00001 per-type sequence)
  const resolvedBudgetType = ['design', 'peer_review'].includes(budgetType) ? budgetType : 'conceptual';
  const prefix = resolvedBudgetType === 'peer_review' ? 'B' : resolvedBudgetType === 'design' ? 'D' : 'C';
  const existingNums = await db.project.findMany({
    // Archived projects keep their budget numbers, so they must be counted or
    // the next number would collide with one (budgetNumber is unique).
    where: { budgetNumber: { startsWith: prefix }, ...INCLUDE_ARCHIVED },
    select: { budgetNumber: true },
  });
  const maxSeq = existingNums.reduce((max, p) => {
    const n = parseInt(p.budgetNumber?.slice(1) ?? '0', 10);
    return n > max ? n : max;
  }, 0);
  const budgetNumber = `${prefix}${String(maxSeq + 1).padStart(5, '0')}`;

  const project = await db.project.create({
    data: {
      projectNumber,
      budgetNumber,
      name,
      buildingType:    buildingType || null,
      projectType:     projectType  || null,   // Multi-Family / Senior Living / …
      location:        locationStr,
      city:            city         || null,
      state:           state        || null,
      zip:             zip ? String(zip).trim().slice(0, 10) : null,
      phase:           VALID_PHASES.includes(phase) ? phase : 'sd',
      serviceType:     VALID_SERVICE_TYPES.includes(serviceType) ? serviceType : null,
      contactEmail:    contactEmail ? String(contactEmail).trim().toLowerCase() : null,
      contactName:     contactName  ? String(contactName).trim().slice(0, 200) : null,
      budgetType:      resolvedBudgetType,
      currentStep:     'project-data',
      createdById:     userId,
      clientId:        clientId     || null,
      pricingSnapshot: JSON.stringify(activePricing),
      // Every project starts at ILC's standard margin (Mike 2026-09-05:
      // "Margin should default at 23%"); editable per project on the dashboard.
      projectData: { create: { marginPct: 0.23 } },
    },
    include: { projectData: true },
  });

  // The day this deal was created, written down per board it starts on.
  await recordProjectCreated(db, project, userId);

  return project;
}
