import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf';

function fmtCurrency(n) {
  if (n == null || n === 0) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  const dt = new Date(d);
  const yy = String(dt.getFullYear()).slice(2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${day}`;
}

// GET /api/projects/[id]/design-bid-matrix/pdf?version=N
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const version = searchParams.get('version') ? Number(searchParams.get('version')) : undefined;
  const origin = new URL(request.url).origin;

  const where = version !== undefined
    ? { projectId: params.id, version }
    : { projectId: params.id };

  const matrix = await prisma.designBidMatrix.findFirst({
    where,
    orderBy: { version: 'desc' },
    include: {
      items:          { where: { isArchived: false }, orderBy: [{ sortOrder: 'asc' }] },
      pushedBy:       { select: { name: true, email: true } },
      sourceSchedule: { select: { version: true, submissionTag: true } },
      project:        { select: { name: true, client: { select: { name: true } } } },
    },
  });

  if (!matrix) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const totalCN = matrix.items.reduce((s, i) => {
    return s + (i.cnTotal ?? ((i.cnPerUnit ?? 0) * (i.qty ?? 1)));
  }, 0);
  const totalDN = matrix.items.reduce((s, i) => {
    return s + ((i.dnPerUnit ?? 0) * (i.qty ?? 1));
  }, 0);

  const dateStr = fmtDate(matrix.createdAt);
  const projectName = matrix.project?.name ?? '';
  const clientName = matrix.project?.client?.name ?? '';
  const pmName = matrix.pushedBy?.name ?? '';
  const pmEmail = matrix.pushedBy?.email ?? '';
  const sourceTag = `Schedule v${matrix.sourceSchedule?.version}${matrix.sourceSchedule?.submissionTag ? ' · ' + matrix.sourceSchedule.submissionTag : ''}`;
  const title = `${dateStr} ${projectName} Design Bid Matrix v${matrix.version}`;

  const rows = matrix.items.map((item, idx) => {
    const cnTotal = item.cnTotal ?? ((item.cnPerUnit ?? 0) * (item.qty ?? 1));
    return `
    <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
      <td>${item.type || ''}</td>
      <td>${item.description || ''}</td>
      <td>${item.locationTag || ''}</td>
      <td>${item.manufacturer || ''}</td>
      <td class="mono">${item.partNumber || ''}</td>
      <td class="right">${item.qty != null ? item.qty : '—'}</td>
      <td class="right">${fmtCurrency(item.dnPerUnit)}</td>
      <td class="right">${fmtCurrency(item.cnPerUnit)}</td>
      <td class="right">${cnTotal > 0 ? fmtCurrency(cnTotal) : '—'}</td>
      <td>${item.notes || ''}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, "Helvetica Neue", sans-serif;
      font-size: 9pt;
      color: #1e1e1e;
      background: white;
    }

    /* ── Repeating page header ── */
    .page-header {
      position: fixed;
      top: 0; left: 0; right: 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 8mm 14mm 5mm 28mm;
      border-bottom: 1px solid #bbb;
      background: white;
      z-index: 10;
    }
    .page-header img { height: 28px; }
    .company-info {
      text-align: right;
      font-size: 7.5pt;
      color: #555;
      line-height: 1.55;
    }

    /* ── Rotated left-margin label ── */
    .watermark {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: 20mm;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22pt;
      font-weight: 700;
      color: #d0d0d0;
      letter-spacing: 3px;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      z-index: 5;
      pointer-events: none;
    }

    /* ── Repeating page footer ── */
    .page-footer {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      padding: 3mm 14mm;
      border-top: 1px solid #bbb;
      font-size: 7pt;
      color: #888;
      font-style: italic;
      background: white;
      z-index: 10;
    }

    /* ── Main content ── */
    .content {
      margin-top: 22mm;
      margin-bottom: 10mm;
      padding: 5mm 14mm 0 28mm;
    }

    /* ── Page 1 info block ── */
    .info-row {
      display: flex;
      gap: 32px;
      margin-bottom: 8mm;
      align-items: flex-start;
    }
    .info-grid {
      flex: 1;
      border: 1px solid #ccc;
      border-collapse: collapse;
    }
    .info-grid table { width: 100%; border-collapse: collapse; }
    .info-grid td {
      padding: 5px 8px;
      border: 1px solid #ddd;
      vertical-align: top;
    }
    .info-label {
      font-size: 7pt;
      font-weight: bold;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      display: block;
      margin-bottom: 2px;
    }
    .info-value { font-size: 9pt; }

    .legal-box {
      flex: 0 0 160px;
      border: 1px solid #ccc;
      padding: 8px 10px;
      font-size: 8pt;
      font-weight: bold;
    }
    .legal-item {
      display: flex;
      gap: 6px;
      margin-bottom: 5px;
      color: #c0392b;
      line-height: 1.35;
    }
    .legal-item span { flex: 0 0 12px; }

    /* ── Line items table ── */
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
    }
    table.items-table thead th {
      background: #2c3e50;
      color: white;
      padding: 5px 6px;
      text-align: left;
      font-size: 7.5pt;
      font-weight: 600;
      white-space: nowrap;
    }
    table.items-table thead { display: table-header-group; }
    table.items-table tbody tr.even { background: #ffffff; }
    table.items-table tbody tr.odd  { background: #f4f6f8; }
    table.items-table td {
      padding: 4px 6px;
      border-bottom: 1px solid #e0e0e0;
      vertical-align: top;
    }
    .right { text-align: right; font-variant-numeric: tabular-nums; }
    .mono  { font-family: "Courier New", monospace; font-size: 7.5pt; }

    /* ── Totals ── */
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 6mm;
    }
    table.totals {
      border-collapse: collapse;
      min-width: 220px;
    }
    table.totals td {
      padding: 3px 8px;
      font-size: 9pt;
    }
    table.totals .total-label { text-align: right; color: #555; }
    table.totals .total-value { text-align: right; font-variant-numeric: tabular-nums; }
    table.totals .grand-row td {
      font-weight: bold;
      border-top: 2px solid #2c3e50;
      padding-top: 5px;
    }

    /* ── Terms ── */
    .terms-section { margin-top: 10mm; }
    .terms-title {
      font-size: 11pt;
      font-weight: bold;
      color: #c0392b;
      border-bottom: 1px solid #ccc;
      padding-bottom: 3px;
      margin-bottom: 6px;
    }
    .terms-box {
      background: #f5f5f5;
      border: 1px solid #ddd;
      padding: 8px 12px;
      border-radius: 2px;
    }
    .terms-item {
      font-size: 8pt;
      font-style: italic;
      margin-bottom: 5px;
      line-height: 1.4;
    }
    .terms-item strong { font-style: normal; }

    @page { size: letter landscape; margin: 0; }
    @media print {
      @page { size: letter landscape; margin: 0; }
    }
  </style>
</head>
<body>

  <div class="page-header">
    <img src="${origin}/ilc-studios-logo.jpg" alt="ILC Studios" />
    <div class="company-info">
      ILC Studios<br>
      2301 Blake Street, Ste 100 | Denver, CO 80205<br>
      720-248-8208 | orders@ilcstudios.com
    </div>
  </div>

  <div class="watermark">Design Bid Matrix</div>

  <div class="page-footer">
    Design Bid Matrix v${matrix.version} | ${projectName}
  </div>

  <div class="content">

    <div class="info-row">
      <div class="info-grid">
        <table>
          <tr>
            <td>
              <span class="info-label">Matrix Version</span>
              <span class="info-value">v${matrix.version}</span>
            </td>
            <td>
              <span class="info-label">Date</span>
              <span class="info-value">${dateStr}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span class="info-label">Project Name</span>
              <span class="info-value">${projectName}</span>
            </td>
            <td>
              <span class="info-label">Client</span>
              <span class="info-value">${clientName}</span>
            </td>
          </tr>
          <tr>
            <td>
              <span class="info-label">Project Manager</span>
              <span class="info-value">${pmName}</span>
            </td>
            <td>
              <span class="info-label">PM Email</span>
              <span class="info-value">${pmEmail}</span>
            </td>
          </tr>
          <tr>
            <td colspan="2">
              <span class="info-label">Source Schedule</span>
              <span class="info-value">${sourceTag}</span>
            </td>
          </tr>
        </table>
      </div>
      <div class="legal-box">
        <div class="legal-item"><span>✓</span> For budgetary purposes only, not an offer to sell</div>
        <div class="legal-item"><span>✓</span> Quote must be requested by client after verifying quantities</div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width:7%">Type</th>
          <th style="width:22%">Description</th>
          <th style="width:9%">Location</th>
          <th style="width:11%">Manufacturer</th>
          <th style="width:11%">Part #</th>
          <th style="width:4%;text-align:right">Qty</th>
          <th style="width:8%;text-align:right">DN / Unit</th>
          <th style="width:8%;text-align:right">CN / Unit</th>
          <th style="width:8%;text-align:right">CN Total</th>
          <th style="width:12%">Notes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals-wrap">
      <table class="totals">
        <tr>
          <td class="total-label">DN Subtotal</td>
          <td class="total-value">${fmtCurrency(totalDN)}</td>
        </tr>
        <tr class="grand-row">
          <td class="total-label">CN Total</td>
          <td class="total-value">${fmtCurrency(totalCN)}</td>
        </tr>
      </table>
    </div>

    <div class="terms-section">
      <div class="terms-title">General Terms</div>
      <div class="terms-box">
        <div class="terms-item">• Pricing is based on a 90-day lead time from submittal.</div>
        <div class="terms-item">• All invoices are Net 15.</div>
        <div class="terms-item">• Warehousing/Freight estimates include 120 days of storage and 10 deliveries to the jobsite.</div>
      </div>
    </div>

    <div class="terms-section" style="margin-top:6mm">
      <div class="terms-title">Contractor Bidding Guidelines</div>
      <div class="terms-box">
        <div class="terms-item"><strong>BID BREAKOUT STRUCTURE</strong><br>
          Contractor is to break out the lighting fixture and lighting control product package prices from labor and materials. Show the total amount for lighting fixtures as one line item and lighting controls as a separate line item.</div>
        <div class="terms-item"><strong>LIGHTING CONTROLS</strong><br>
          Bid price is provided by ILC, but formal submittals, drawings and one-lines will be provided after 100% CD.</div>
        <div class="terms-item"><strong>LOW VOLTAGE &amp; LINEAR FIXTURES</strong><br>
          Bid price is provided by ILC, but lengths and power supply takeoffs will be verified during the ordering phase by the contractor.</div>
        <div class="terms-item"><strong>SALES TAX</strong><br>
          ILC will provide a best estimate for sales tax per our physical office locations, but the bidding contractor is to adjust for any missing sales tax.</div>
      </div>
    </div>

  </div>

</body>
</html>`;

  try {
    const pdf = await htmlToPdf(html, { landscape: true });
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${title}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[design-bid-matrix/pdf]', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
