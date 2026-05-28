import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ASHRAE 90.1-2022 §9.5.1 interior LPD limits
const ASHRAE_LIMITS = {
  corridor:  0.66,
  garage:    0.21,
  parking:   0.21,
  boh:       0.75,
  amenity:   0.80,
  office:    0.98,
  lobby:     0.90,
  classroom: 1.24,
  retail:    1.05,
  warehouse: 0.33,
};

const LOCATION_LABELS = {
  units:     'Residential Units',
  corridor:  'Corridor / Hallway',
  garage:    'Parking Garage',
  parking:   'Parking',
  boh:       'Back of House',
  amenity:   'Amenity / Common Area',
  office:    'Office',
  lobby:     'Lobby / Entry',
  exterior:  'Exterior / Site',
  classroom: 'Classroom',
  retail:    'Retail',
  warehouse: 'Warehouse',
  controls:  'Controls',
  other:     'Other',
};

function normalizeLocation(loc) {
  if (!loc) return 'other';
  const s = String(loc).toLowerCase().trim();
  if (s.includes('unit') || s.includes('resid') || s.includes('apt') || s.includes('dwelling') || s.includes('suite')) return 'units';
  if (s.includes('corridor') || s.includes('hallway') || s.includes('hall') || s.includes('egress') || s.includes('stair')) return 'corridor';
  if (s.includes('garage') || s.includes('parking') || s.includes('park')) return 'garage';
  if (s.includes('boh') || s.includes('back of house') || s.includes('service') || s.includes('storage') || s.includes('mech') || s.includes('utility') || s.includes('janitor')) return 'boh';
  if (s.includes('amenity') || s.includes('lounge') || s.includes('gym') || s.includes('fitness') || s.includes('club') || s.includes('pool') || s.includes('common') || s.includes('rec ') || s.includes('recreation')) return 'amenity';
  if (s.includes('office') || s.includes('admin') || s.includes('leasing') || s.includes('management')) return 'office';
  if (s.includes('lobby') || s.includes('entry') || s.includes('entrance') || s.includes('reception') || s.includes('vestibule')) return 'lobby';
  if (s.includes('exterior') || s.includes('site') || s.includes('outdoor') || s.includes('canopy') || s.includes('facade') || s.includes('drive') || s.includes('walkway') || s.includes('path')) return 'exterior';
  if (s.includes('classroom') || s.includes('class') || s.includes('learning')) return 'classroom';
  if (s.includes('retail') || s.includes('shop') || s.includes('store') || s.includes('merch')) return 'retail';
  if (s.includes('warehouse') || s.includes('industrial') || s.includes('production')) return 'warehouse';
  if (s.includes('control')) return 'controls';
  return 'other';
}

// Score how likely a column name is to represent a given field
function scoreColumn(header, patterns) {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [score, ...words] of patterns) {
    if (words.some(w => h === w || h.includes(w))) return score;
  }
  return 0;
}

const COLUMN_PATTERNS = {
  type:        [[10, 'type', 'typecode', 'mark', 'fixturetype', 'fixturekey', 'id'], [5, 'tag', 'symbol', 'code']],
  description: [[10, 'description', 'desc', 'fixture', 'name', 'product'], [5, 'model', 'label']],
  wattage:     [[10, 'wattage', 'watts', 'watt', 'power'], [8, 'w'], [5, 'energy']],
  qty:         [[10, 'qty', 'quantity', 'count', 'num', 'number', 'total'], [8, 'ea', 'each'], [5, 'units']],
  location:    [[10, 'location', 'space', 'area', 'zone', 'room', 'loc'], [5, 'floor', 'level', 'section']],
  areaSf:      [[10, 'areasf', 'sf', 'sqft', 'squarefeet', 'squarefoot', 'floorarea'], [8, 'area', 'footage']],
  manufacturer:[[10, 'manufacturer', 'mfr', 'brand', 'vendor', 'make'], [5, 'mfg']],
  catalogNumber:[[10, 'catalog', 'catalognumber', 'catno', 'partno', 'model', 'sku'], [5, 'part', 'item']],
  lumens:      [[10, 'lumens', 'lumen', 'lm', 'output']],
  cct:         [[10, 'cct', 'colortemp', 'kelvin', 'kelvins', 'k'], [5, 'color']],
  dimming:     [[10, 'dimming', 'dim', 'dimmable', 'control', 'protocol']],
  mounting:    [[10, 'mounting', 'mount', 'installation', 'install']],
};

function autoDetectColumns(headers) {
  const mapping = {};
  const used = new Set();

  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    let best = null, bestScore = 0;
    for (const h of headers) {
      if (used.has(h)) continue;
      const score = scoreColumn(h, patterns);
      if (score > bestScore) { best = h; bestScore = score; }
    }
    if (best && bestScore >= 5) {
      mapping[field] = best;
      used.add(best);
    }
  }
  return mapping;
}

function parseNumber(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;

  let formData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: 'No file provided' }, { status: 400 }); }

  const file = formData.get('file');
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const fileName = file.name || 'upload';
  const ext = fileName.split('.').pop().toLowerCase();
  const allowed = ['csv', 'xlsx', 'xls'];
  if (!allowed.includes(ext)) {
    return NextResponse.json({ error: `Unsupported format. Upload a CSV or Excel file (.csv, .xlsx, .xls)` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Parse with xlsx
  const XLSX = require('xlsx');
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } catch (e) {
    return NextResponse.json({ error: 'Could not read file: ' + e.message }, { status: 422 });
  }

  // Use last sheet (same convention as parseTakeoff.js)
  const sheetName = wb.SheetNames[wb.SheetNames.length - 1];
  const ws = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (rawData.length < 2) {
    return NextResponse.json({ error: 'File appears empty or has only one row' }, { status: 400 });
  }

  // Find header row — first row with at least 3 non-empty cells
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    const nonEmpty = rawData[i].filter(c => String(c).trim()).length;
    if (nonEmpty >= 3) { headerRowIdx = i; break; }
  }

  const headers = rawData[headerRowIdx].map(h => String(h).trim()).filter(Boolean);
  const allHeaders = rawData[headerRowIdx].map(h => String(h).trim()); // keep positions
  const dataRows = rawData.slice(headerRowIdx + 1);

  const columnMap = autoDetectColumns(headers);

  // Extract rows
  const rows = [];
  for (const rawRow of dataRows) {
    // Skip empty rows
    const cells = rawRow.map(c => String(c).trim());
    if (cells.every(c => !c)) continue;

    function getCol(field) {
      const header = columnMap[field];
      if (!header) return null;
      const idx = allHeaders.indexOf(header);
      if (idx < 0) return null;
      const val = cells[idx];
      return val || null;
    }

    const type    = getCol('type');
    const wattage = parseNumber(getCol('wattage'));
    const qty     = parseNumber(getCol('qty'));
    const loc     = getCol('location');
    const sf      = parseNumber(getCol('areaSf'));

    // Skip rows with no type or no wattage — they're likely headers/notes
    if (!type && wattage == null) continue;

    rows.push({
      type:          type || '—',
      description:   getCol('description') || null,
      manufacturer:  getCol('manufacturer') || null,
      catalogNumber: getCol('catalogNumber') || null,
      lumens:        getCol('lumens') || null,
      cct:           getCol('cct') || null,
      dimming:       getCol('dimming') || null,
      mounting:      getCol('mounting') || null,
      wattage,
      qty,
      location:      loc || null,
      locationSlug:  normalizeLocation(loc),
      areaSf:        sf,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({
      error: 'No fixture data found. Make sure the file has columns for type/mark, wattage, and location.',
    }, { status: 400 });
  }

  // Group by location slug, build area summaries
  const areaMap = {};
  for (const row of rows) {
    const slug = row.locationSlug;
    if (!areaMap[slug]) {
      areaMap[slug] = {
        slug,
        label:        LOCATION_LABELS[slug] ?? slug,
        rawLocations: new Set(),
        fixtures:     [],
        areaSf:       null,
      };
    }
    if (row.location) areaMap[slug].rawLocations.add(row.location.trim());

    // Track area SF if provided
    if (row.areaSf != null && row.areaSf > 0) {
      areaMap[slug].areaSf = row.areaSf;
    }

    areaMap[slug].fixtures.push({
      type:     row.type,
      wattage:  row.wattage,
      qty:      row.qty,
      totalWatts: (row.wattage != null && row.qty != null) ? row.wattage * row.qty : null,
    });
  }

  const areas = Object.values(areaMap).map(area => {
    const hasAllWattage = area.fixtures.every(f => f.wattage != null);
    const hasAllQty     = area.fixtures.every(f => f.qty != null);
    const totalWatts    = (hasAllWattage && hasAllQty)
      ? area.fixtures.reduce((s, f) => s + (f.totalWatts ?? 0), 0)
      : null;
    const ashraeLimit = ASHRAE_LIMITS[area.slug] ?? null;

    return {
      slug:         area.slug,
      label:        area.label,
      rawLocations: [...area.rawLocations].join(', '),
      fixtures:     area.fixtures,
      totalWatts,
      areaSf:       area.areaSf,
      ashraeLimit,
      hasAllWattage,
      hasAllQty,
    };
  });

  // Sort by slug label
  areas.sort((a, b) => a.label.localeCompare(b.label));

  const hasQty      = rows.some(r => r.qty != null);
  const hasLocation = rows.some(r => r.location != null);

  return NextResponse.json({
    fileName,
    rowCount: rows.length,
    headers,
    columnMap,
    areas,
    hasQty,
    hasLocation,
    warnings: [
      !hasQty      && 'No quantity column detected — enter quantities manually to calculate LPD',
      !hasLocation && 'No location column detected — locations are required to group by area',
    ].filter(Boolean),
  });
}
