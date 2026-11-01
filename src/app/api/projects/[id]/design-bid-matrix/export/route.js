import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NOT_CO_VERSION } from '@/lib/budgetVersions';
import * as XLSX from 'xlsx';

// GET /api/projects/[id]/design-bid-matrix/export?version=N
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const version = searchParams.get('version') ? Number(searchParams.get('version')) : undefined;

  const where = version !== undefined
    ? { projectId: params.id, version }
    : { projectId: params.id, ...NOT_CO_VERSION };

  const matrix = await prisma.designBidMatrix.findFirst({
    where,
    orderBy: { version: 'desc' },
    include: {
      items:          { where: { isArchived: false }, orderBy: [{ sortOrder: 'asc' }] },
      pushedBy:       { select: { name: true } },
      sourceSchedule: { select: { version: true, submissionTag: true } },
      project:        { select: { name: true } },
    },
  });

  if (!matrix) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const wb = XLSX.utils.book_new();

  // ── Metadata sheet ──
  const meta = [
    ['Project',        matrix.project?.name ?? ''],
    ['Bid Matrix v',   matrix.version],
    ['Submission Tag', matrix.submissionTag ?? ''],
    ['Source Schedule', `v${matrix.sourceSchedule?.version}${matrix.sourceSchedule?.submissionTag ? ' · ' + matrix.sourceSchedule.submissionTag : ''}`],
    ['Pushed By',      matrix.pushedBy?.name ?? ''],
    ['Date',           new Date(matrix.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
  ];
  const metaWs = XLSX.utils.aoa_to_sheet(meta);
  XLSX.utils.book_append_sheet(wb, metaWs, 'Info');

  // ── Items sheet ──
  const headers = ['Type', 'Description', 'Location', 'Manufacturer', 'Part Number', 'Sales Rep', 'RFQ Status', 'DN / Unit', 'CN / Unit', 'Pricing Date', 'Notes', 'Internal Notes'];
  const dataRows = matrix.items.map(item => [
    item.type          || '',
    item.description   || '',
    item.locationTag   || '',
    item.manufacturer  || '',
    item.partNumber    || '',
    item.salesRep      || '',
    item.rfqStatus     || '',
    item.dnPerUnit     != null ? Number(item.dnPerUnit)  : '',
    item.cnPerUnit     != null ? Number(item.cnPerUnit)  : '',
    item.pricingLastUpdated ? new Date(item.pricingLastUpdated).toLocaleDateString('en-US') : '',
    item.notes         || '',
    item.internalNotes || '',
  ]);

  const totalDN = matrix.items.reduce((s, i) => s + (i.dnPerUnit ?? 0), 0);
  const totalCN = matrix.items.reduce((s, i) => s + (i.cnPerUnit ?? 0), 0);
  const totalsRow = ['', '', '', '', '', '', 'TOTAL', totalDN, totalCN, '', '', ''];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, [], totalsRow]);

  // Column widths
  ws['!cols'] = [
    { wch: 10 }, { wch: 30 }, { wch: 18 }, { wch: 18 },
    { wch: 22 }, { wch: 18 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 28 }, { wch: 28 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Design Bid Matrix');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `DesignBidMatrix_v${matrix.version}${matrix.submissionTag ? '_' + matrix.submissionTag.replace(/\s+/g, '_') : ''}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
