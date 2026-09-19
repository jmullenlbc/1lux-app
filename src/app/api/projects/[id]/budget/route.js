import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { calculateBudget } from '@/lib/calculations';
import { responsesToSections } from '@/lib/utils';
import { captureQuietly } from '@/lib/calibration/capture';
import { SITE_FEATURE_INCLUDE, engineProjectData } from '@/lib/siteFeatureRows';

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { projectData: true, responses: true, ...SITE_FEATURE_INCLUDE },
  });

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sections = responsesToSections(project.responses);
  // Same engine inputs as the project pages: building type key + live site
  // feature rows. This route used to pass the bare ProjectData row.
  const budget   = calculateBudget(engineProjectData(project), sections);
  captureQuietly(project.id);

  return NextResponse.json({ budget });
}
