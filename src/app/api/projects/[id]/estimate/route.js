import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runParametricEstimate, deriveWizardCounts } from '@/lib/parametricEstimate';

// GET /api/projects/[id]/estimate?tierPrefs=<json>
export async function GET(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { projectData: true },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  let tierPrefs = {};
  try { tierPrefs = JSON.parse(searchParams.get('tierPrefs') || '{}'); } catch {}

  const [fixtures, ilcSpecs, masterTypes] = await Promise.all([
    prisma.placedFixture.findMany({
      where: { projectId: params.id, status: { not: 'DELETED' } },
      include: { masterType: { select: { code: true, fixture_family: true, is_unit_type: true } } },
    }),
    prisma.iLCSpec.findMany({
      where: { is_active: true },
      select: {
        id: true, master_type_id: true, family: true, description: true,
        manufacturer: true, base_catalog: true, full_catalog: true,
        budget_cost: true, tier: true, is_default: true, is_active: true,
      },
      orderBy: [{ is_default: 'desc' }, { tier: 'asc' }],
    }),
    prisma.masterType
      ? prisma.masterType.findMany({ select: { code: true, fixture_family: true, is_unit_type: true } })
      : Promise.resolve([]),
  ]);

  const pd = project.projectData || {};
  const freightRate     = pd.freightPct     != null ? Number(pd.freightPct)     : 0.06;
  const warehousingRate = pd.warehousingPct != null ? Number(pd.warehousingPct) : 0.03;
  const salesTaxPct     = pd.salesTaxPct    != null ? Number(pd.salesTaxPct)    : 0;

  const estimate = runParametricEstimate({
    fixtures, ilcSpecs, masterTypes,
    freightRate, warehousingRate, salesTaxPct,
    tierPrefs,
  });

  const wizardCounts = deriveWizardCounts(fixtures);

  return NextResponse.json({
    estimate,
    wizardCounts,
    confirmedCount: fixtures.filter(f => f.status === 'CONFIRMED').length,
    totalCount:     fixtures.filter(f => f.status !== 'DELETED').length,
    projectData: { freightRate, warehousingRate, salesTaxPct },
  });
}

// POST /api/projects/[id]/estimate/apply — write wizard counts back to projectData
export async function POST(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json(); // { numFans, numVanities, ... }

  const existing = await prisma.projectData.findUnique({ where: { projectId: params.id } });
  if (!existing) return NextResponse.json({ error: 'No project data found' }, { status: 404 });

  const updated = await prisma.projectData.update({
    where: { projectId: params.id },
    data: body,
  });

  return NextResponse.json({ ok: true, updated });
}
