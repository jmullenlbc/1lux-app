import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deriveShipmentStatus } from '@/lib/shipmentStatus';
import { readUploadedFile } from '@/lib/uploadIntake';

/**
 * POST /api/projects/[id]/shipments/import
 * Body: multipart/form-data with field "file" (xlsx/xls/csv)
 *
 * Maps Route 40 ship schedule columns:
 *   TYPE, DESCRIPTION, CATALOG NO, QTY, MANUFACTURER,
 *   LEAD TIME, ESD, TRACKING, DELIVERED DATE, FIXTURE STATUS, NOTES
 *
 * Groups line items by MANUFACTURER to auto-create Shipment records.
 * Returns preview data, does NOT write to DB unless ?commit=true.
 */
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const commit = url.searchParams.get('commit') === 'true';

  const formData = await req.formData();
  const upload = await readUploadedFile(formData);
  if (!upload.ok) return NextResponse.json({ error: upload.message }, { status: upload.status });
  const buffer = upload.buffer;
  await upload.cleanup();

  let rows;
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  } catch {
    return NextResponse.json({ error: 'Could not parse file. Upload an .xlsx or .xls file.' }, { status: 400 });
  }

  // ── Column normalisation ─────────────────────────────────────────────────
  function col(row, ...candidates) {
    for (const c of candidates) {
      const key = Object.keys(row).find(k => k.trim().toUpperCase() === c.toUpperCase());
      if (key && row[key] !== '') return String(row[key]).trim();
    }
    return '';
  }

  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // ── Group by manufacturer ────────────────────────────────────────────────
  const groups = new Map(); // manufacturer → { shipmentFields, lineItems[] }

  for (const row of rows) {
    const manufacturer = col(row, 'MANUFACTURER', 'MFR', 'VENDOR') || 'Unknown';
    const type        = col(row, 'TYPE', 'FIXTURE TYPE', 'FIXTURE_TYPE');
    const description = col(row, 'DESCRIPTION', 'DESC');
    if (!type && !description) continue; // skip blank rows

    if (!groups.has(manufacturer)) {
      groups.set(manufacturer, {
        manufacturer,
        leadTimeWeeks: col(row, 'LEAD TIME', 'LEAD_TIME', 'LEADTIME') || null,
        esdDate:       parseDate(col(row, 'ESD', 'ESTIMATED SHIP DATE', 'EST SHIP DATE')),
        trackingNumber:col(row, 'TRACKING', 'TRACKING NUMBER', 'TRACKING NO') || null,
        deliveredDate: parseDate(col(row, 'DELIVERED DATE', 'DELIVERED', 'DELIVERY DATE')),
        lineItems: [],
      });
    }

    const g = groups.get(manufacturer);
    // If later rows have tracking/delivery data, use it (last-write wins per manufacturer)
    if (!g.leadTimeWeeks) g.leadTimeWeeks = col(row, 'LEAD TIME', 'LEAD_TIME', 'LEADTIME') || null;
    if (!g.esdDate)       g.esdDate       = parseDate(col(row, 'ESD', 'ESTIMATED SHIP DATE', 'EST SHIP DATE'));
    if (!g.trackingNumber)g.trackingNumber= col(row, 'TRACKING', 'TRACKING NUMBER', 'TRACKING NO') || null;
    if (!g.deliveredDate) g.deliveredDate = parseDate(col(row, 'DELIVERED DATE', 'DELIVERED', 'DELIVERY DATE'));

    g.lineItems.push({
      fixtureType:  type        || '—',
      description:  description || '—',
      catalogNo:    col(row, 'CATALOG NO', 'CATALOG NUMBER', 'CAT NO', 'CATALOG') || null,
      qty:          parseInt(col(row, 'QTY', 'QUANTITY', 'QTY.'), 10) || 1,
      fixtureStatus:col(row, 'FIXTURE STATUS', 'STATUS') || null,
      notes:        col(row, 'NOTES', 'NOTE') || null,
    });
  }

  const shipmentGroups = Array.from(groups.values()).map(g => ({
    ...g,
    status: deriveShipmentStatus(g),
  }));

  if (!commit) {
    return NextResponse.json({ preview: shipmentGroups, rowCount: rows.length });
  }

  // ── Commit ───────────────────────────────────────────────────────────────
  const created = [];
  for (const g of shipmentGroups) {
    const shipment = await prisma.shipment.create({
      data: {
        project_id:    params.id,
        manufacturer:  g.manufacturer,
        poDate:        null,
        leadTimeWeeks: g.leadTimeWeeks,
        esdDate:       g.esdDate,
        trackingNumber:g.trackingNumber,
        deliveredDate: g.deliveredDate,
        status:        g.status,
        lineItems: {
          create: g.lineItems,
        },
      },
      include: { lineItems: true },
    });
    created.push(shipment);
  }

  return NextResponse.json({ imported: created.length, shipments: created }, { status: 201 });
}
