import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/activity';

// Map projectData fields → questionnaire (section, questionKey) for bidirectional sync
const QUESTIONNAIRE_SYNC = {
  grossSf:            { section: 'project-data', key: 'grossSf' },
  unitsSf:            { section: 'project-data', key: 'unitsSf' },
  numUnits:           { section: 'project-data', key: 'numUnits' },
  numBedrooms:        { section: 'project-data', key: 'numBedrooms' },
  numBathrooms:       { section: 'project-data', key: 'numBathrooms' },
  numVanities:        { section: 'project-data', key: 'numVanities' },
  numBalconies:       { section: 'project-data', key: 'numBalconies' },
  numEgressStairwells:{ section: 'project-data', key: 'numEgressStairwells' },
  numFans:            { section: 'project-data', key: 'numFans' },
  numAccentDownlights:{ section: 'project-data', key: 'numAccentDownlights' },
  numSurfaceParking:  { section: 'project-data', key: 'numSurfaceParking' },
  numCarports:        { section: 'project-data', key: 'numCarports' },
  numGarages:         { section: 'project-data', key: 'numGarages' },
  numExteriorDoors:   { section: 'project-data', key: 'numExteriorDoors' },
  corridorSf:         { section: 'project-data', key: 'corridorSf' },
  garageSf:           { section: 'project-data', key: 'garageSf' },
  interiorAmenitySf:  { section: 'project-data', key: 'interiorAmenitySf' },
  exteriorAmenitySf:  { section: 'project-data', key: 'exteriorAmenitySf' },
  bohSf:              { section: 'project-data', key: 'bohSf' },
  lotSf:              { section: 'project-data', key: 'lotSf' },
  buildingFootprintSf:{ section: 'project-data', key: 'buildingFootprintSf' },
  clientInitialBudget:{ section: 'project-data', key: 'clientInitialBudget' },
  freightPct:         { section: 'project-data', key: 'freightPct' },
  warehousingPct:     { section: 'project-data', key: 'warehousingPct' },
  salesTaxPct:        { section: 'project-data', key: 'salesTaxPct' },
  marginPct:          { section: 'project-data', key: 'marginPct' },
};

const FIELD_LABELS = {
  grossSf: 'Total Gross SF', unitsSf: 'Units SF', numUnits: '# Units',
  numBedrooms: '# Bedrooms', numBalconies: '# Balconies', numBathrooms: '# Bathrooms',
  numVanities: '# Vanities', numEgressStairwells: '# Stairwell Landings',
  numFans: '# of Fans', numAccentDownlights: '# Accent Downlights',
  numSurfaceParking: '# Surface Parking',
  numCarports: '# Carports', numGarages: '# Garages', numExteriorDoors: '# Exterior Doors',
  corridorSf: 'Corridor SF', garageSf: 'Garage SF', interiorAmenitySf: 'Interior Amenity SF',
  exteriorAmenitySf: 'Exterior Amenity SF', bohSf: 'BOH SF', lotSf: 'Lot SF',
  buildingFootprintSf: 'Building Footprint SF',
  clientInitialBudget: 'Initial Budget',
  freightPct: 'Freight %', warehousingPct: 'Warehousing %', salesTaxPct: 'Sales Tax %',
};

export async function PUT(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  const numericFields = Object.keys(QUESTIONNAIRE_SYNC);

  const data = {};
  for (const field of numericFields) {
    if (body[field] !== undefined) {
      const val = parseFloat(body[field]);
      data[field] = isNaN(val) ? null : val;
    }
  }

  // Compute which fields actually changed for a useful description
  const existing = await prisma.projectData.findUnique({ where: { projectId: params.id } });
  const changedFields = Object.keys(data).filter(k => {
    const oldVal = existing?.[k] ?? null;
    const newVal = data[k] ?? null;
    return String(oldVal) !== String(newVal);
  });

  let description;
  if (changedFields.length === 0) {
    description = 'Saved Project Data (no changes)';
  } else if (changedFields.length <= 3) {
    const labels = changedFields.map(f => FIELD_LABELS[f] || f);
    description = `Updated Project Data: ${labels.join(', ')}`;
  } else {
    description = `Updated ${changedFields.length} fields in Project Data`;
  }

  const updated = await prisma.projectData.upsert({
    where: { projectId: params.id },
    update: data,
    create: { projectId: params.id, ...data },
  });

  // ── Sync changed fields → QuestionnaireResponse for wizard consistency ────
  const syncOps = changedFields
    .filter(f => QUESTIONNAIRE_SYNC[f])
    .map(f => {
      const { section, key } = QUESTIONNAIRE_SYNC[f];
      const val = data[f];
      return prisma.questionnaireResponse.upsert({
        where: { projectId_section_questionKey: { projectId: params.id, section, questionKey: key } },
        update: { answerValue: val == null ? null : String(val) },
        create: { projectId: params.id, section, questionKey: key, answerValue: val == null ? null : String(val) },
      });
    });

  if (syncOps.length > 0) {
    await Promise.all(syncOps);
  }

  await logActivity(params.id, user, 'project_data', description, { changed: changedFields });

  return NextResponse.json({ projectData: updated });
}

// PATCH — same as PUT for compatibility (single-field saves from dashboard)
export async function PATCH(request, { params }) {
  return PUT(request, { params });
}
