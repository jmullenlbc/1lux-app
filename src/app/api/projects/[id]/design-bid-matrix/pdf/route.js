import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

function fmtCurrency(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// GET /api/projects/[id]/design-bid-matrix/pdf?version=N
// Returns a standalone print-ready HTML page for PDF export
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const version = searchParams.get('version') ? Number(searchParams.get('version')) : undefined;

  const where = version !== undefined
    ? { projectId: params.id, version }
    : { projectId: params.id };

  const matrix = await prisma.designBidMatrix.findFirst({
    where,
    orderBy: { version: 'desc' },
    include: {
      items:          { where: { isArchived: false }, orderBy: [{ sortOrder: 'asc' }] },
      pushedBy:       { select: { name: true } },
      sourceSchedule: { select: { version: true, submissionTag: true } },
      project:        { select: { name: true, address: true, city: true, state: true } },
    },
  });

  if (!matrix) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const totalDN = matrix.items.reduce((s, i) => s + (i.dnPerUnit ?? 0), 0);
  const totalCN = matrix.items.reduce((s, i) => s + (i.cnPerUnit ?? 0), 0);

  const rows = matrix.items.map((item, idx) => `
    <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
      <td>${item.type || ''}</td>
      <td>${item.description || ''}</td>
      <td>${item.locationTag || ''}</td>
      <td>${item.manufacturer || ''}</td>
      <td class="mono">${item.partNumber || ''}</td>
      <td>${item.salesRep || ''}</td>
      <td>${item.rfqStatus || ''}</td>
      <td class="num">${fmtCurrency(item.dnPerUnit)}</td>
      <td class="num">${fmtCurrency(item.cnPerUnit)}</td>
      <td>${item.notes || ''}</td>
    </tr>`).join('');

  const projectLine = [matrix.project?.name, matrix.project?.city, matrix.project?.state].filter(Boolean).join(', ');
  const dateLine = new Date(matrix.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const sourceTag = `Schedule v${matrix.sourceSchedule?.version}${matrix.sourceSchedule?.submissionTag ? ' · ' + matrix.sourceSchedule.submissionTag : ''}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Design Bid Matrix v${matrix.version} — ${matrix.project?.name ?? ''}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 10pt; color: #1e293b; background: #fff; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 2px solid #7c3aed; }
    .header-left h1 { font-size: 16pt; font-weight: 700; color: #1e293b; }
    .header-left p  { font-size: 9pt; color: #64748b; margin-top: 2px; }
    .header-right   { text-align: right; font-size: 9pt; color: #64748b; }
    .meta-chips { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
    .chip { background: #f1f5f9; color: #475569; border-radius: 999px; padding: 3px 10px; font-size: 8.5pt; font-weight: 500; }
    .chip.purple { background: #ede9fe; color: #7c3aed; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    thead th { background: #1e293b; color: #fff; padding: 6px 7px; text-align: left; font-weight: 600; font-size: 8.5pt; letter-spacing: 0.03em; white-space: nowrap; }
    tbody tr.even { background: #fff; }
    tbody tr.odd  { background: #f8fafc; }
    td { padding: 5px 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    td.num  { text-align: right; font-variant-numeric: tabular-nums; }
    td.mono { font-family: "SF Mono", "Fira Mono", monospace; font-size: 8.5pt; }
    tfoot tr { background: #1e293b; color: #fff; }
    tfoot td { padding: 6px 7px; font-weight: 700; }
    tfoot td.num { text-align: right; }
    .footer { margin-top: 16px; font-size: 8pt; color: #94a3b8; text-align: center; }
    @media print {
      body { padding: 0; }
      @page { margin: 15mm 12mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>Design Bid Matrix</h1>
      <p>${projectLine}</p>
    </div>
    <div class="header-right">
      <p><strong>ILC Studios</strong></p>
      <p>${dateLine}</p>
      <p>Pushed by ${matrix.pushedBy?.name ?? 'Unknown'}</p>
    </div>
  </div>

  <div class="meta-chips">
    <span class="chip purple">Version ${matrix.version}</span>
    ${matrix.submissionTag ? `<span class="chip">${matrix.submissionTag}</span>` : ''}
    <span class="chip">Source: ${sourceTag}</span>
    <span class="chip">${matrix.items.length} line items</span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:7%">Type</th>
        <th style="width:18%">Description</th>
        <th style="width:10%">Location</th>
        <th style="width:11%">Manufacturer</th>
        <th style="width:13%">Part #</th>
        <th style="width:9%">Sales Rep</th>
        <th style="width:9%">RFQ Status</th>
        <th style="width:9%;text-align:right">DN / Unit</th>
        <th style="width:9%;text-align:right">CN / Unit</th>
        <th style="width:15%">Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="7" style="font-size:8.5pt">Total — ${matrix.items.length} items</td>
        <td class="num">${fmtCurrency(totalDN)}</td>
        <td class="num">${fmtCurrency(totalCN)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    Confidential · ILC Studios · Generated ${dateLine}
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
