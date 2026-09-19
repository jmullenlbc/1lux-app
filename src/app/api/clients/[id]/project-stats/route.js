import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { calculateBudget } from '@/lib/calculations';
import { responsesToSections } from '@/lib/utils';
import { loadPricing } from '@/lib/pricingLoader';
import { SITE_FEATURE_INCLUDE, engineProjectData } from '@/lib/siteFeatureRows';

// GET /api/clients/[id]/project-stats
// Computes per-project budget metrics for every linked project, for the
// "Project Data" tab to aggregate (avg $/unit & $/SF by building type, etc.).
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && client.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const projects = await prisma.project.findMany({
    where:   { clientId: params.id },
    include: { projectData: true, responses: true, ...SITE_FEATURE_INCLUDE },
  });

  const pricing = await loadPricing();
  const rows = [];

  for (const p of projects) {
    if (!p.projectData) continue;
    try {
      const pd       = engineProjectData(p);
      const budget   = calculateBudget(pd, responsesToSections(p.responses), pricing);
      const total    = budget.totalWithControls || 0;
      const units    = pd.numUnits || 0;
      const grossSf  = pd.grossSf || 0;
      rows.push({
        name:         p.name,
        buildingType: p.buildingType || 'unknown',
        units,
        grossSf,
        total,
        perUnit:      units   ? total / units   : 0,
        perSf:        grossSf ? total / grossSf : 0,
        numFans:      pd.numFans || 0,
        numAccent:    pd.numAccentDownlights || 0,
        numVanities:  pd.numVanities || 0,
        numBathrooms: pd.numBathrooms || 0,
        numBalconies: pd.numBalconies || 0,
      });
    } catch { /* skip projects that fail to compute */ }
  }

  return NextResponse.json({ rows });
}
