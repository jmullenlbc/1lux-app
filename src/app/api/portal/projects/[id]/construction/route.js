import { NextResponse } from 'next/server';
import { requirePortalAuth } from '@/lib/portalAuth';
import { prisma } from '@/lib/db';

/**
 * GET /api/portal/projects/[id]/construction
 * Returns construction milestone dates for the portal.
 * Requires canViewConstructionSched permission.
 *
 * Returns:
 *   - projectDates: { constructionStartDate, mepRoughInDate, constructionEndDate }
 *   - aiMilestones: array of { id, label, date } from the most recent
 *     AI-parsed construction schedule file (or [] if none)
 */
export async function GET(req, { params }) {
  const { portalUser, error } = await requirePortalAuth();
  if (error) return error;

  const contact = await prisma.projectExternalContact.findFirst({
    where: { project_id: params.id, portalUserId: portalUser.portalUserId, acceptedAt: { not: null } },
  });
  if (!contact?.canViewConstructionSched) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Project-level milestone columns
  const project = await prisma.project.findUnique({
    where:  { id: params.id },
    select: { constructionStartDate: true, mepRoughInDate: true, constructionEndDate: true },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // AI-extracted milestones from the most recent construction schedule file
  // (stored in takeoffData as { milestones: [...] } on files tagged 'Construction Schedule' in the 'ca' tab)
  let aiMilestones = [];
  try {
    const scheduleFile = await prisma.projectFile.findFirst({
      where:   { projectId: params.id, tab: 'ca', tags: { contains: 'Construction Schedule' } },
      orderBy: { createdAt: 'desc' },
      select:  { takeoffData: true },
    });
    if (scheduleFile?.takeoffData) {
      const parsed = JSON.parse(scheduleFile.takeoffData);
      if (Array.isArray(parsed.milestones)) {
        aiMilestones = parsed.milestones;
      }
    }
  } catch {}

  return NextResponse.json({
    projectDates: {
      constructionStartDate: project.constructionStartDate,
      mepRoughInDate:        project.mepRoughInDate,
      constructionEndDate:   project.constructionEndDate,
    },
    aiMilestones,
  });
}
