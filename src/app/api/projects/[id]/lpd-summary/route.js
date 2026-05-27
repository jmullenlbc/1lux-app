import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// ASHRAE 90.1-2022 interior LPD limits (W/ft²) by normalized location slug
const ASHRAE_LIMITS = {
  corridor:  0.66,
  units:     null,  // residential — no ASHRAE limit (exception)
  garage:    0.21,
  parking:   0.21,
  boh:       0.75,
  amenity:   0.80,
  office:    0.98,
  lobby:     0.90,
  exterior:  null,  // site/exterior — no single ASHRAE interior limit
  controls:  null,
  other:     null,
};

const LOCATION_LABELS = {
  units:    'Residential Units',
  corridor: 'Corridor',
  garage:   'Parking Garage',
  parking:  'Parking',
  boh:      'Back of House',
  amenity:  'Amenity',
  office:   'Office',
  lobby:    'Lobby',
  exterior: 'Exterior / Site',
  controls: 'Controls',
  other:    'Other',
};

// Normalize a free-text location string to a known slug
function normalizeLocation(loc) {
  if (!loc) return 'other';
  const s = loc.toLowerCase().trim();
  if (s.includes('unit') || s.includes('resid') || s.includes('apt') || s.includes('dwelling')) return 'units';
  if (s.includes('corridor') || s.includes('hallway') || s.includes('hall') || s.includes('egress')) return 'corridor';
  if (s.includes('garage') || s.includes('parking')) return 'garage';
  if (s.includes('boh') || s.includes('back of house') || s.includes('service') || s.includes('storage') || s.includes('mech') || s.includes('utility')) return 'boh';
  if (s.includes('amenity') || s.includes('lounge') || s.includes('gym') || s.includes('fitness') || s.includes('club') || s.includes('pool') || s.includes('common')) return 'amenity';
  if (s.includes('office') || s.includes('admin') || s.includes('leasing')) return 'office';
  if (s.includes('lobby') || s.includes('entry') || s.includes('entrance') || s.includes('reception')) return 'lobby';
  if (s.includes('exterior') || s.includes('site') || s.includes('outdoor') || s.includes('canopy') || s.includes('facade') || s.includes('drive')) return 'exterior';
  if (s.includes('control')) return 'controls';
  return 'other';
}

// Match a fixture type code to a takeoff key
// takeoffKeys: string[] of keys from takeoffData
// typeCode: string like "A", "B1", "SP1"
function matchTakeoffKey(typeCode, takeoffKeys) {
  if (!typeCode || !takeoffKeys?.length) return null;
  const code = typeCode.trim().toUpperCase();
  // 1. Exact match (case-insensitive)
  const exact = takeoffKeys.find(k => k.trim().toUpperCase() === code);
  if (exact) return exact;
  // 2. Takeoff key starts with type code followed by space, dash, or comma
  const prefix = takeoffKeys.find(k => {
    const ku = k.trim().toUpperCase();
    return ku.startsWith(code + ' ') || ku.startsWith(code + '-') || ku.startsWith(code + ',');
  });
  return prefix ?? null;
}

// Map a normalized location slug to ProjectData area SF
function getAreaSf(slug, projectData) {
  if (!projectData) return null;
  switch (slug) {
    case 'units':    return projectData.unitsSf     ?? null;
    case 'corridor': return projectData.corridorSf  ?? null;
    case 'garage':
    case 'parking':  return projectData.garageSf    ?? null;
    case 'boh':      return projectData.bohSf       ?? null;
    case 'amenity':  return projectData.interiorAmenitySf ?? null;
    case 'exterior': return projectData.exteriorAmenitySf ?? null;
    default:         return null;
  }
}

export async function GET(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const projectId = params.id;

  // Load all data in parallel
  const [scheduleData, takeoffFile, projectData] = await Promise.all([
    prisma.fixtureSchedule.findFirst({
      where: { projectId, state: 'DRAFT' },
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    }),
    prisma.projectFile.findFirst({
      where: { projectId, takeoffData: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { takeoffData: true, originalName: true, createdAt: true },
    }),
    prisma.projectData.findUnique({ where: { projectId } }),
  ]);

  const items = scheduleData?.items ?? [];
  const takeoffRaw = takeoffFile?.takeoffData ? JSON.parse(takeoffFile.takeoffData) : null;
  const takeoffKeys = takeoffRaw ? Object.keys(takeoffRaw) : [];

  // Only process non-alternate items with a wattage
  const mainItems = items.filter(i => !i.isAlternate && i.wattage);

  // Group by normalized location, accumulate watts
  const areaMap = {};  // slug → { fixtures: [], rawLocations: Set }

  for (const item of mainItems) {
    const slug = normalizeLocation(item.location);
    if (!areaMap[slug]) areaMap[slug] = { fixtures: [], rawLocations: new Set() };

    const watts = parseFloat(item.wattage);
    if (isNaN(watts) || watts <= 0) continue;

    const takeoffKey = matchTakeoffKey(item.type, takeoffKeys);
    const qty = takeoffKey != null ? (takeoffRaw[takeoffKey] ?? 0) : null;

    areaMap[slug].fixtures.push({
      type:        item.type || '—',
      description: item.description || null,
      wattage:     watts,
      qty:         qty,
      totalWatts:  qty != null ? watts * qty : null,
      takeoffKey:  takeoffKey,
    });

    if (item.location) areaMap[slug].rawLocations.add(item.location.trim());
  }

  // Build area summary rows
  const areas = Object.entries(areaMap).map(([slug, data]) => {
    const totalWatts = data.fixtures.reduce((sum, f) => {
      return f.totalWatts != null ? sum + f.totalWatts : sum;
    }, 0);
    const hasAllQtys = data.fixtures.every(f => f.qty != null);
    const areaSf = getAreaSf(slug, projectData);
    const ashraeLimit = ASHRAE_LIMITS[slug] ?? null;
    const lpd = areaSf && areaSf > 0 && hasAllQtys ? totalWatts / areaSf : null;

    return {
      slug,
      label:       LOCATION_LABELS[slug] ?? slug,
      rawLocations: [...data.rawLocations].join(', '),
      fixtures:    data.fixtures,
      totalWatts:  hasAllQtys ? totalWatts : null,
      areaSf,
      lpd,
      ashraeLimit,
      compliant:   lpd != null && ashraeLimit != null ? lpd <= ashraeLimit : null,
    };
  });

  // Sort: areas with LPD first, then unknowns
  areas.sort((a, b) => {
    if (a.lpd != null && b.lpd == null) return -1;
    if (a.lpd == null && b.lpd != null) return 1;
    return (a.label).localeCompare(b.label);
  });

  return NextResponse.json({
    areas,
    hasSchedule: items.length > 0,
    hasTakeoff:  !!takeoffRaw,
    takeoffFile: takeoffFile ? { name: takeoffFile.originalName, date: takeoffFile.createdAt } : null,
    hasAreas:    !!projectData && Object.keys(projectData).some(k => k.endsWith('Sf') && projectData[k] != null),
  });
}
