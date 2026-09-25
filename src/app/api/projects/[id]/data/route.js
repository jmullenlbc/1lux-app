import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { captureQuietly } from '@/lib/calibration/capture';
import { SITE_FEATURE_ROW_LABELS } from '@/lib/siteFeatures';
import {
  isSiteFeatureRowKey, siteFeatureFromFlat, writeSiteFeature,
  loadSiteFeatures, siteFeaturesForEngine, describeSiteFeatureChange,
} from '@/lib/siteFeatureRows';
import { parseLooseNumber, isUnreadableNumber, NUMBER_HELP } from '@/lib/numberInput';
import { recordFigureSources } from '@/lib/figures/record';


// Map projectData fields → questionnaire (section, questionKey) for bidirectional sync
const QUESTIONNAIRE_SYNC = {
  grossSf:            { section: 'project-data', key: 'grossSf' },
  unitsSf:            { section: 'project-data', key: 'unitsSf' },
  numUnits:           { section: 'project-data', key: 'numUnits' },
  numBuildings:       { section: 'project-data', key: 'numBuildings' },
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

  bohManualAdder:       { section: 'project-data', key: 'bohManualAdder' },
  garageManualAdder:    { section: 'project-data', key: 'garageManualAdder' },
  exitSignsManualAdder: { section: 'project-data', key: 'exitSignsManualAdder' },
};

// Drawing-takeoff counts (Phase 1, 2026-08-12): saveable from the Dashboard's
// Counts panel and (later) the drawing parser, but deliberately NOT wizard
// questions — so they are not in QUESTIONNAIRE_SYNC and never sync to the
// questionnaire. Mike: these get "filled out in an automated way".
const NON_QUESTIONNAIRE_FIELDS = ['numElevatorShafts', 'numFloors'];

const FIELD_LABELS = {
  grossSf: 'Total Gross SF', unitsSf: 'Units SF', numUnits: '# Units',
  numBuildings: '# Buildings',
  numBedrooms: '# Bedrooms', numBalconies: '# of Balconies', numBathrooms: '# Bathrooms',
  numVanities: '# Vanities', numEgressStairwells: '# Stairwell Landings',
  numFans: '# of Fans', numAccentDownlights: '# Accent Downlights',
  numSurfaceParking: '# Surface Parking',
  numCarports: '# Carports', numGarages: '# Garages', numExteriorDoors: '# Exterior Doors',
  numElevatorShafts: '# Elevator Shafts', numFloors: '# Floors',
  corridorSf: 'Corridor SF', garageSf: 'Garage SF', interiorAmenitySf: 'Interior Amenity SF',
  exteriorAmenitySf: 'Exterior Amenity SF', bohSf: 'BOH SF', lotSf: 'Lot SF',
  buildingFootprintSf: 'Building Footprint SF',
  clientInitialBudget: 'Initial Budget',
  freightPct: 'Freight %', warehousingPct: 'Warehousing %', salesTaxPct: 'Sales Tax %',
  marginPct: 'Margin %',
  bohManualAdder: 'BOH manual adder', garageManualAdder: 'Garage manual adder',
  exitSignsManualAdder: 'Exit Signs manual adder',
  contingencyPct: 'Contingency %',
  ...SITE_FEATURE_ROW_LABELS,
};

export async function PUT(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  const numericFields = [...Object.keys(QUESTIONNAIRE_SYNC), ...NON_QUESTIONNAIRE_FIELDS];

  // Preserve-on-blank semantics: skip fields that arrive as undefined,
  // null, or empty string. Treats blanks as "no change" rather than
  // "clear to null", which prevents stale wizard forms from silently
  // wiping saved data on Save & Continue.
  //
  // Background: on 2026-06-22, the APPROACH II project lost
  // exteriorAmenitySf=19909 and several other fields after he reopened
  // the wizard and clicked through. The wizard's Project Data form
  // sends every field in its payload, including blanks that hadn't been
  // populated from a stale projectData prop — the old loop treated each
  // blank as null and overwrote the DB column.
  //
  // Trade-off: the wizard can no longer be used to *clear* an existing
  // value. Clears must go through the Dashboard's single-field PATCH
  // (which sends one field at a time, so clearing is explicit).
  // Typed figures may carry commas ("226,000") or units ("226,000 SF");
  // parseFloat used to read "226,000" as 226. The loose reader takes the
  // dressing off; a cell that is not a number at all is refused up front so
  // one typo never silently drops one figure while the rest save.
  const unreadable = [...numericFields, 'contingencyPct']
    .filter(f => isUnreadableNumber(body[f]))
    .map(f => FIELD_LABELS[f] || f);
  if (unreadable.length) {
    return NextResponse.json({ error: `${NUMBER_HELP} (${unreadable.join(', ')})` }, { status: 400 });
  }
  const data = {};
  for (const field of numericFields) {
    const val = parseLooseNumber(body[field]);
    if (val === undefined || val === null || !Number.isFinite(val)) continue;
    data[field] = val;
  }

  // contingencyPct is not a questionnaire field — handle separately
  if (body.contingencyPct !== undefined &&
      body.contingencyPct !== null &&
      body.contingencyPct !== '') {
    const val = parseLooseNumber(body.contingencyPct);
    if (Number.isFinite(val) && val >= 0 && val <= 50) data.contingencyPct = val;
  }

  // ── Site features (0089) ───────────────────────────────────────────────────
  // The six sporadic-feature figures (dog parks, courtyard feet, playgrounds,
  // tennis / pickleball courts, turf play feet) arrive as flat keys from the
  // same grids as everything else, but they are NOT ProjectData columns: each
  // becomes its own SiteFeature row (archive the live one, write a fresh one,
  // source 'typed'). Blank = no change, like every other field; 0 = "none",
  // which archives the live row and creates nothing.
  const featureWrites = [];
  for (const key of Object.keys(body)) {
    if (!isSiteFeatureRowKey(key)) continue;
    const v = body[key];
    if (v === undefined || v === null || v === '') continue;
    const f = siteFeatureFromFlat(key, v);
    if (f) featureWrites.push(f);
  }

  // Compute which fields actually changed for a useful description
  const existing = await prisma.projectData.findUnique({ where: { projectId: params.id } });
  const changedFields = Object.keys(data).filter(k => {
    const oldVal = existing?.[k] ?? null;
    const newVal = data[k] ?? null;
    return String(oldVal) !== String(newVal);
  });

  const liveFeatures = featureWrites.length ? await loadSiteFeatures(prisma, params.id) : [];
  const featureChanges = [];
  for (const f of featureWrites) {
    const before = liveFeatures.find(r => r.type === f.type) || null;
    const change = describeSiteFeatureChange(f.type, before, f);
    if (change.was !== change.now) featureChanges.push(change);
  }
  for (const c of featureChanges) changedFields.push(c.key);

  let description;
  if (changedFields.length === 0) {
    description = 'Saved Project Data (no changes)';
  } else if (changedFields.length === 1 && featureChanges.length === 1) {
    description = `Updated **${FIELD_LABELS[featureChanges[0].key]}**: ${featureChanges[0].was} → ${featureChanges[0].now} · Project Data`;
  } else if (changedFields.length === 1) {
    const field = changedFields[0];
    const label = FIELD_LABELS[field] || field;
    const oldVal = String(existing?.[field] ?? '(blank)');
    const newVal = String(data[field] ?? '(blank)');
    description = `Updated **${label}**: ${oldVal} → ${newVal} · Project Data`;
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

  // Only the kinds whose figure actually changed are rewritten, so re-saving
  // the wizard form does not archive-and-recreate identical rows every time.
  if (featureChanges.length) {
    const changedTypes = new Set(featureChanges.map(c => c.type));
    await prisma.$transaction(async (tx) => {
      for (const f of featureWrites) {
        if (!changedTypes.has(f.type)) continue;
        await writeSiteFeature(tx, params.id, { ...f, source: 'typed' });
      }
    });
  }

  await logActivity(params.id, user, 'project_data', description, { changed: changedFields });
  // Typed by staff = a real number the tool may learn from (Mike 2026-09-24).
  await recordFigureSources(prisma, params.id, changedFields, 'staff', user?.id ?? null);
  captureQuietly(params.id, { minIntervalMs: 0 });

  // The grids replace their working copy of Project Info with this object and
  // the engine reads `siteFeatures` off it, so the live rows ride along.
  const siteFeatures = siteFeaturesForEngine(await loadSiteFeatures(prisma, params.id));
  return NextResponse.json({ projectData: { ...updated, buildingTypeKey: project.buildingType, siteFeatures } });
}

// PATCH — same as PUT for compatibility (single-field saves from dashboard)
export async function PATCH(request, { params }) {
  return PUT(request, { params });
}
