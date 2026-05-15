import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import * as XLSX from 'xlsx';

// GET /api/projects/[id]/fixture-schedule/export?version=draft|N
// version=draft → exports the current draft
// version=N     → exports published version N
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const version = searchParams.get('version') ?? 'draft';

  let schedule;
  if (version === 'draft') {
    schedule = await prisma.fixtureSchedule.findFirst({
      where: { projectId: params.id, state: 'DRAFT' },
      include: {
        items:   { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        project: { select: { name: true } },
      },
    });
  } else {
    schedule = await prisma.fixtureSchedule.findFirst({
      where: { projectId: params.id, state: 'PUBLISHED', version: Number(version) },
      include: {
        items:       { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        publishedBy: { select: { name: true } },
        project:     { select: { name: true } },
      },
    });
  }

  if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const wb = XLSX.utils.book_new();

  // ── Info sheet ──
  const info = [
    ['Project',  schedule.project?.name ?? ''],
    ['Version',  version === 'draft' ? 'Draft' : `v${schedule.version}`],
    ...(schedule.submissionTag ? [['Submission Tag', schedule.submissionTag]] : []),
    ...(schedule.publishedAt   ? [['Published',      new Date(schedule.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })]] : []),
    ...(schedule.publishedBy   ? [['Published By',   schedule.publishedBy.name]] : []),
    ['Rows', schedule.items.length],
    ['Exported', new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'Info');

  // ── Schedule sheet ──
  const headers = [
    'Type', 'Location', 'Description', 'Manufacturer', 'Catalog #',
    'Finish', 'CCT', 'Lumens', 'Wattage', 'Voltage', 'Dimming', 'Mounting', 'Notes',
  ];
  const rows = schedule.items.map(item => [
    item.type          || '',
    item.location      || '',
    item.description   || '',
    item.manufacturer  || '',
    item.catalogNumber || '',
    item.finish        || '',
    item.cct           || '',
    item.lumens        || '',
    item.wattage       || '',
    item.voltage       || '',
    item.dimming       || '',
    item.mounting      || '',
    item.notes         || '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 10 }, { wch: 16 }, { wch: 32 }, { wch: 18 }, { wch: 24 },
    { wch: 10 }, { wch: 8  }, { wch: 10 }, { wch: 8  }, { wch: 8  },
    { wch: 14 }, { wch: 14 }, { wch: 28 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Fixture Schedule');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const versionLabel = version === 'draft' ? 'Draft' : `v${schedule.version}`;
  const tagPart = schedule.submissionTag ? '_' + schedule.submissionTag.replace(/\s+/g, '_') : '';
  const filename = `FixtureSchedule_${versionLabel}${tagPart}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
