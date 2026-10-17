/**
 * Deterministic rule-based QC checks for fixture schedule items.
 * Each check returns a CheckResult.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseWatts(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

function hasKeyword(str, keywords) {
  if (!str) return false;
  const s = str.toLowerCase();
  return keywords.some(kw => s.includes(kw));
}

// Classify what a fixture "is" by scanning description + notes + type
function classifyFixture(item) {
  const text = [item.type, item.description, item.notes, item.location].filter(Boolean).join(' ').toLowerCase();
  return {
    isExitSign:   hasKeyword(text, ['exit sign', 'exit-sign', 'exit lite', 'exit light', ' exit ']),
    isEmergency:  hasKeyword(text, ['emergency', 'em driver', 'em unit', 'battery backup', 'unit equipment', 'egress light']),
    isWetLocation: hasKeyword(text, ['wet location', 'wet-location', 'wet loc', 'wet rated', 'wet list']),
    isDampLocation: hasKeyword(text, ['damp location', 'damp-location', 'damp loc', 'damp rated', 'damp list']),
    locationWet:  hasKeyword(item.location || '', ['shower', 'pool', 'fountain', 'car wash', 'exterior wet', 'wet']),
    locationDamp: hasKeyword(item.location || '', ['exterior', 'covered', 'canopy', 'breezeway', 'carport', 'garage', 'bathroom', 'bath']),
  };
}

// ASHRAE 90.1-2022 limits used by the LPD engine (same as lpd-summary route)
const ASHRAE_LIMITS = {
  corridor: 0.66,
  garage:   0.21,
  boh:      0.75,
  amenity:  0.80,
  office:   0.98,
  lobby:    0.90,
};

function normalizeLocation(loc) {
  if (!loc) return 'other';
  const s = loc.toLowerCase().trim();
  if (s.includes('unit') || s.includes('resid') || s.includes('apt') || s.includes('dwelling')) return 'units';
  if (s.includes('corridor') || s.includes('hallway') || s.includes('hall') || s.includes('egress')) return 'corridor';
  if (s.includes('garage') || s.includes('parking')) return 'garage';
  if (s.includes('boh') || s.includes('back of house') || s.includes('service') || s.includes('storage') || s.includes('mech')) return 'boh';
  if (s.includes('amenity') || s.includes('lounge') || s.includes('gym') || s.includes('fitness') || s.includes('common')) return 'amenity';
  if (s.includes('office') || s.includes('admin') || s.includes('leasing')) return 'office';
  if (s.includes('lobby') || s.includes('entry') || s.includes('entrance') || s.includes('reception')) return 'lobby';
  if (s.includes('exterior') || s.includes('site') || s.includes('outdoor') || s.includes('canopy') || s.includes('drive')) return 'exterior';
  return 'other';
}

function matchTakeoffKey(typeCode, takeoffKeys) {
  if (!typeCode || !takeoffKeys?.length) return null;
  const code = typeCode.trim().toUpperCase();
  const exact = takeoffKeys.find(k => k.trim().toUpperCase() === code);
  if (exact) return exact;
  return takeoffKeys.find(k => {
    const ku = k.trim().toUpperCase();
    return ku.startsWith(code + ' ') || ku.startsWith(code + '-') || ku.startsWith(code + ',');
  }) ?? null;
}

function getAreaSf(slug, projectData) {
  if (!projectData) return null;
  switch (slug) {
    case 'units':    return projectData.unitsSf ?? null;
    case 'corridor': return projectData.corridorSf ?? null;
    case 'garage':
    case 'parking':  return projectData.garageSf ?? null;
    case 'boh':      return projectData.bohSf ?? null;
    case 'amenity':  return projectData.interiorAmenitySf ?? null;
    case 'exterior': return projectData.exteriorAmenitySf ?? null;
    default:         return null;
  }
}

// ── Individual checks ─────────────────────────────────────────────────────────

export function checkWattageMissing(items) {
  const mainItems = items.filter(i => !i.isAlternate);
  const flagged = mainItems.filter(i => {
    const w = parseWatts(i.wattage);
    return w == null || w <= 0;
  });

  return {
    id:       'wattage-missing',
    title:    'Missing wattage',
    code:     'ASHRAE 90.1-2022 §9.5.1',
    category: 'Completeness',
    severity: 'FLAG',
    status:   flagged.length === 0 ? 'PASS' : 'FLAG',
    summary:  flagged.length === 0
      ? 'All fixture types have wattage specified'
      : `${flagged.length} fixture type${flagged.length !== 1 ? 's' : ''} missing wattage, LPD cannot be verified`,
    items: flagged.map(i => ({
      type:    i.type || '(no type)',
      detail:  i.description || '',
      message: 'No wattage: LPD and compliance checks blocked for this type',
    })),
  };
}

export function checkDimmingAnnotation(items) {
  const interior = items.filter(i => {
    if (i.isAlternate) return false;
    const slug = normalizeLocation(i.location);
    if (slug === 'exterior' || slug === 'controls') return false;
    const c = classifyFixture(i);
    // Exit signs and emergency units don't require dimming
    if (c.isExitSign || c.isEmergency) return false;
    return true;
  });

  const flagged = interior.filter(i => !i.dimming || i.dimming.trim() === '');

  return {
    id:       'dimming-missing',
    title:    'Dimming protocol not annotated',
    code:     'ASHRAE 90.1-2022 §9.4.1',
    category: 'Completeness',
    severity: 'WARN',
    status:   flagged.length === 0 ? 'PASS' : 'WARN',
    summary:  flagged.length === 0
      ? 'All interior fixtures have dimming annotation'
      : `${flagged.length} interior fixture type${flagged.length !== 1 ? 's' : ''} missing dimming protocol`,
    items: flagged.map(i => ({
      type:    i.type || '(no type)',
      detail:  i.description || '',
      message: 'No dimming protocol specified, required for most interior spaces under ASHRAE §9.4.1 automatic shutoff',
    })),
  };
}

export function checkExitSignCompliance(items) {
  const exitItems = items.filter(i => !i.isAlternate && classifyFixture(i).isExitSign);
  if (exitItems.length === 0) {
    return {
      id: 'exit-sign-wattage', title: 'Exit sign compliance', code: 'IFC 2021 §1013',
      category: 'Life Safety', severity: 'VERIFY', status: 'SKIP',
      summary: 'No exit sign fixture types identified in schedule, verify schedule is complete',
      items: [],
    };
  }

  const flagged = exitItems.filter(i => {
    const w = parseWatts(i.wattage);
    return w != null && w > 5;
  });

  const noWattage = exitItems.filter(i => {
    const w = parseWatts(i.wattage);
    return w == null || w <= 0;
  });

  const status = flagged.length > 0 ? 'FLAG' : noWattage.length > 0 ? 'VERIFY' : 'PASS';

  return {
    id:       'exit-sign-wattage',
    title:    'Exit sign wattage ≤ 5W',
    code:     'IFC 2021 §1013',
    category: 'Life Safety',
    severity: 'FLAG',
    status,
    summary:
      flagged.length > 0
        ? `${flagged.length} exit sign type${flagged.length !== 1 ? 's' : ''} exceed 5W, the IFC §1013 limit for internally illuminated signs`
        : noWattage.length > 0
          ? `${exitItems.length} exit sign type${exitItems.length !== 1 ? 's' : ''} identified, verify wattage ≤ 5W`
          : `${exitItems.length} exit sign type${exitItems.length !== 1 ? 's' : ''} comply with 5W limit`,
    items: [
      ...flagged.map(i => ({
        type: i.type || '(no type)', detail: i.description || '',
        message: `Wattage ${i.wattage}W exceeds 5W limit for internally illuminated exit signs`,
      })),
      ...noWattage.map(i => ({
        type: i.type || '(no type)', detail: i.description || '',
        message: 'No wattage specified, cannot verify 5W compliance',
      })),
    ],
  };
}

export function checkEmergencyFixtures(items) {
  const emItems = items.filter(i => !i.isAlternate && classifyFixture(i).isEmergency);

  if (emItems.length === 0) {
    return {
      id: 'emergency-circuit', title: 'Emergency circuit fixtures', code: 'IFC 2021 §1008',
      category: 'Life Safety', severity: 'VERIFY', status: 'SKIP',
      summary: 'No emergency/egress fixture types identified, verify egress path lighting is on schedule',
      items: [],
    };
  }

  const noEmDriver = emItems.filter(i => {
    const text = [i.description, i.notes, i.dimming].filter(Boolean).join(' ').toLowerCase();
    return !text.includes('em driver') && !text.includes('battery') && !text.includes('unit equip') && !text.includes('EM') && !text.includes('emergency');
  });

  return {
    id:       'emergency-circuit',
    title:    'Emergency fixtures: 90-min backup',
    code:     'IFC 2021 §1008',
    category: 'Life Safety',
    severity: 'VERIFY',
    status:   noEmDriver.length > 0 ? 'VERIFY' : 'PASS',
    summary:  noEmDriver.length > 0
      ? `${noEmDriver.length} emergency fixture type${noEmDriver.length !== 1 ? 's' : ''}, verify EM driver or unit equipment specified for 90-min backup`
      : `${emItems.length} emergency fixture type${emItems.length !== 1 ? 's' : ''}, backup power specified`,
    items: noEmDriver.map(i => ({
      type:    i.type || '(no type)',
      detail:  i.description || '',
      message: 'EM driver or battery backup not explicitly noted. IFC §1008 requires 90-min emergency power',
    })),
  };
}

export function checkWetDampLocation(items) {
  const issues = [];

  for (const item of items) {
    if (item.isAlternate) continue;
    const c = classifyFixture(item);

    if (c.locationWet && !c.isWetLocation) {
      issues.push({
        type:    item.type || '(no type)',
        detail:  item.description || '',
        message: `Location "${item.location}" suggests wet environment, verify fixture is UL listed for Wet Location (NEC §410.10(A))`,
        level:   'FLAG',
      });
    } else if (c.locationDamp && !c.isDampLocation && !c.isWetLocation) {
      issues.push({
        type:    item.type || '(no type)',
        detail:  item.description || '',
        message: `Location "${item.location}" suggests damp environment, verify fixture is listed for Damp or Wet Location`,
        level:   'VERIFY',
      });
    }
  }

  const hasFlags = issues.some(i => i.level === 'FLAG');
  const status = hasFlags ? 'FLAG' : issues.length > 0 ? 'VERIFY' : 'PASS';

  return {
    id:       'wet-damp-location',
    title:    'Wet/damp location listing',
    code:     'NEC 2020 §410.10(A)',
    category: 'Listing & Location',
    severity: 'FLAG',
    status,
    summary:  issues.length === 0
      ? 'No obvious wet/damp location listing issues identified'
      : `${issues.length} fixture type${issues.length !== 1 ? 's' : ''} need wet/damp listing verification`,
    items: issues,
  };
}

export function checkLPDCompliance(items, takeoffData, projectData) {
  const takeoffKeys = takeoffData ? Object.keys(takeoffData) : [];

  // Build area map
  const areaMap = {};
  for (const item of items) {
    if (item.isAlternate) continue;
    const w = parseWatts(item.wattage);
    if (!w || w <= 0) continue;

    const slug = normalizeLocation(item.location);
    if (slug === 'units' || slug === 'exterior' || slug === 'controls' || slug === 'other') continue;

    if (!areaMap[slug]) areaMap[slug] = { watts: 0, complete: true };
    const key = matchTakeoffKey(item.type, takeoffKeys);
    if (key == null) { areaMap[slug].complete = false; continue; }
    const qty = takeoffData?.[key] ?? 0;
    areaMap[slug].watts += w * qty;
  }

  const results = [];
  for (const [slug, data] of Object.entries(areaMap)) {
    const limit = ASHRAE_LIMITS[slug];
    if (!limit) continue;
    const sf = getAreaSf(slug, projectData);
    if (!sf || sf <= 0) {
      results.push({ slug, label: slug, status: 'VERIFY', watts: data.watts, sf: null, lpd: null, limit, message: `Area SF not set, enter in Project Data to verify LPD ≤ ${limit} W/ft²` });
      continue;
    }
    if (!data.complete) {
      results.push({ slug, label: slug, status: 'VERIFY', watts: null, sf, lpd: null, limit, message: `Some fixture quantities unknown, upload a takeoff to verify LPD ≤ ${limit} W/ft²` });
      continue;
    }
    const lpd = data.watts / sf;
    results.push({ slug, label: slug, status: lpd > limit ? 'FLAG' : 'PASS', watts: data.watts, sf, lpd, limit,
      message: lpd > limit
        ? `LPD ${lpd.toFixed(3)} W/ft² exceeds ASHRAE 90.1 limit of ${limit} W/ft²`
        : `LPD ${lpd.toFixed(3)} W/ft² ≤ ${limit} W/ft² limit` });
  }

  const flags = results.filter(r => r.status === 'FLAG');
  const verifies = results.filter(r => r.status === 'VERIFY');
  const status = flags.length > 0 ? 'FLAG' : verifies.length > 0 ? 'VERIFY' : results.length > 0 ? 'PASS' : 'SKIP';

  return {
    id:       'lpd-compliance',
    title:    'LPD compliance by space',
    code:     'ASHRAE 90.1-2022 §9.5.1',
    category: 'Lighting Power Density',
    severity: 'FLAG',
    status,
    summary:  results.length === 0
      ? 'No LPD-applicable spaces found, add fixture schedule with wattage and location tags'
      : flags.length > 0
        ? `${flags.length} space${flags.length !== 1 ? 's' : ''} exceed ASHRAE 90.1 LPD limits`
        : verifies.length > 0
          ? `${verifies.length} space${verifies.length !== 1 ? 's' : ''} need more data to verify LPD`
          : `All ${results.length} applicable spaces within ASHRAE 90.1 LPD limits`,
    items: results.map(r => ({
      type:    r.label.charAt(0).toUpperCase() + r.label.slice(1),
      detail:  r.lpd != null ? `${r.lpd.toFixed(3)} W/ft² (limit: ${r.limit} W/ft²)` : '',
      message: r.message,
      level:   r.status,
    })),
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function runAllChecks(items, projectData, takeoffData) {
  const mainItems = items.filter(i => !i.isAlternate);
  const checks = [
    checkWattageMissing(items),
    checkLPDCompliance(items, takeoffData, projectData),
    checkWetDampLocation(items),
    checkExitSignCompliance(items),
    checkEmergencyFixtures(items),
    checkDimmingAnnotation(items),
  ];

  const total   = checks.filter(c => c.status !== 'SKIP').length;
  const flags   = checks.filter(c => c.status === 'FLAG').length;
  const verifies= checks.filter(c => c.status === 'VERIFY').length;
  const warns   = checks.filter(c => c.status === 'WARN').length;
  const passes  = checks.filter(c => c.status === 'PASS').length;

  return {
    checks,
    meta: {
      fixtureCount: mainItems.length,
      total, flags, verifies, warns, passes,
      overallStatus: flags > 0 ? 'FLAG' : verifies > 0 ? 'VERIFY' : 'PASS',
    },
  };
}
