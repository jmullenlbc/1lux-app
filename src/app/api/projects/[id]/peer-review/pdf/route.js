import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf';

const ORANGE = '#F7941D';
const BLACK  = '#231F20';
const GREY   = '#555555';

const DESIGN_BID_SERVICE_TYPES = new Set(['fullDesign', 'designAssist']);

const LOCATION_TAGS = [
  { id: 'units',    label: 'Units'         },
  { id: 'corridor', label: 'Corridor'      },
  { id: 'garage',   label: 'Garage'        },
  { id: 'boh',      label: 'BOH'           },
  { id: 'office',   label: 'Office'        },
  { id: 'amenity',  label: 'Amenity'       },
  { id: 'exterior', label: 'Exterior/Site' },
  { id: 'controls', label: 'Controls'      },
  { id: 'other',    label: 'Other'         },
];

function r2(n) { return Math.round((n ?? 0) * 100) / 100; }
function fmtMoney(n) {
  if (n == null) return '';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const yy = String(dt.getFullYear()).slice(2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
}

const PHASE_LABELS = { sd: 'Schematic Design', dd: 'Design Development', cd: 'Construction Documents', ifc: 'IFC', construction: 'Construction', closeout: 'Closeout' };

// GET /api/projects/[id]/peer-review/pdf
export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      projectData:     true,
      peerReviewItems: { where: { typeCode: { not: null } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      client:          { select: { name: true } },
      createdBy:       { select: { name: true, email: true } },
    },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const items        = project.peerReviewItems;
  const pd           = project.projectData || {};
  const matrixType   = project.peerReviewMatrixType || (DESIGN_BID_SERVICE_TYPES.has(project.serviceType) ? 'DESIGN_BID' : 'PEER_REVIEW');
  const isDesignBid  = matrixType === 'DESIGN_BID';
  const NCOLS        = isDesignBid ? 9 : 11;

  const lightingItems = items.filter(i => i.section !== 'controls');
  const controlsItems = items.filter(i => i.section === 'controls');

  const rawLighting = r2(lightingItems.reduce((s, i) => s + (i.totalSavings || 0), 0));
  const rawControls = r2(controlsItems.reduce((s, i) => s + (i.totalSavings || 0), 0));
  const rawTotal    = r2(rawLighting + rawControls);

  const freightPctVal     = pd.freightPct     ?? 0.06;
  const warehousingPctVal = pd.warehousingPct ?? 0.03;
  const salesTaxPctVal    = pd.salesTaxPct    ?? 0;

  const freightAmt     = r2(rawTotal * freightPctVal);
  const warehousingAmt = r2(rawTotal * warehousingPctVal);
  const salesTaxAmt    = r2(rawTotal * salesTaxPctVal);
  const totalAdders    = r2(freightAmt + warehousingAmt + salesTaxAmt);
  const grandTotal     = r2(rawTotal + totalAdders);

  const subtotalLighting = r2(rawLighting + r2(rawLighting * (freightPctVal + warehousingPctVal + salesTaxPctVal)));
  const subtotalControls = r2(rawControls + r2(rawControls * (freightPctVal + warehousingPctVal + salesTaxPctVal)));

  const grossSf      = pd.grossSf  || null;
  const numUnits     = pd.numUnits || null;
  const dollarPerSf  = grossSf  && grandTotal ? grandTotal / grossSf  : null;
  const dollarPerUnit = numUnits && grandTotal ? grandTotal / numUnits : null;

  const printDate   = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const budgetDate  = project.budgetSentDate
    ? new Date(project.budgetSentDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : printDate;
  const dateStr     = fmtDate(new Date());
  const title       = `${dateStr} ${project.name} ${isDesignBid ? 'Design Bid Matrix' : 'Budget Matrix'}`;

  // ── Build table rows ─────────────────────────────────────────────────────────
  function buildSectionRows(tag, isControls) {
    const tagItems = [...items.filter(i => i.section === tag.id)].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (tagItems.length === 0) return '';
    const secCnTotal = r2(tagItems.reduce((s, i) => s + (i.totalSavings || 0), 0));
    const hdrBg = isControls ? '#e8dcf8' : '#ddeeff';

    const rows = tagItems.map((item, idx) => {
      const cnTotal = item.qty != null && item.propUnitPrice != null ? r2(item.qty * item.propUnitPrice) : null;
      const bg = idx % 2 === 0 ? '#ffffff' : '#f5f5f5';
      return `<tr style="background:${bg}">
        <td style="font-weight:800;color:${esc(BLACK)};padding:3px 5px">${esc(item.typeCode)}</td>
        <td style="color:${esc(BLACK)};padding:3px 5px">${esc(item.description)}</td>
        ${!isDesignBid ? `<td style="color:${GREY};padding:3px 5px">${esc(item.specManufacturer)}</td>` : ''}
        ${!isDesignBid ? `<td style="font-family:'Courier New',monospace;font-size:6.5pt;color:${GREY};padding:3px 5px">${esc(item.specModel)}</td>` : ''}
        <td style="color:${ORANGE};font-weight:600;padding:3px 5px">${esc(item.propManufacturer)}</td>
        <td style="font-family:'Courier New',monospace;font-size:6.5pt;color:${ORANGE};padding:3px 5px">${esc(item.propModel)}</td>
        <td style="text-align:right;font-weight:700;padding:3px 5px">${item.qty != null ? item.qty : ''}</td>
        <td style="color:${GREY};font-size:6.5pt;padding:3px 5px">${item.qtyType === 'linearFt' ? 'LF' : item.qty != null ? 'EA' : ''}</td>
        <td style="text-align:right;color:${GREY};padding:3px 5px">${item.propUnitPrice != null ? esc(fmtMoney(item.propUnitPrice)) : ''}</td>
        <td style="text-align:right;font-weight:700;color:${esc(BLACK)};padding:3px 5px">${cnTotal != null ? esc(fmtMoney(cnTotal)) : ''}</td>
        <td style="color:${GREY};font-size:7pt;padding:3px 5px">${esc(item.notes)}</td>
      </tr>`;
    }).join('');

    const hdrColspan = `colspan="${NCOLS}"`;
    const subColspan = `colspan="${NCOLS - 1}"`;
    return `
      <tr style="background:${hdrBg}">
        <td ${hdrColspan} style="padding:4px 5px;font-size:7.5pt;font-weight:700;color:${esc(BLACK)};text-transform:uppercase;letter-spacing:0.05em">${esc(tag.label)}</td>
      </tr>
      ${rows}
      <tr>
        <td ${subColspan} style="text-align:right;color:${GREY};font-size:6.5pt;text-transform:uppercase;letter-spacing:0.05em;padding:3px 5px">
          ${esc(tag.label)} Subtotal
        </td>
        <td style="text-align:right;font-weight:700;color:${esc(BLACK)};padding:3px 5px">${secCnTotal > 0 ? esc(fmtMoney(secCnTotal)) : '—'}</td>
      </tr>`;
  }

  const lightingTags = LOCATION_TAGS.filter(t => t.id !== 'controls');
  let tableBody = lightingTags.map(tag => buildSectionRows(tag, false)).join('');
  if (items.some(i => i.section === 'controls')) {
    const ctrlTag = LOCATION_TAGS.find(t => t.id === 'controls');
    tableBody += buildSectionRows(ctrlTag, true);
  }

  const thStyle = `style="background:#2c3e50;color:white;padding:5px 6px;text-align:left;font-size:7.5pt;font-weight:600;white-space:nowrap"`;
  const thOrange = `style="background:#2c3e50;color:${ORANGE};padding:5px 6px;text-align:left;font-size:7.5pt;font-weight:600;white-space:nowrap"`;

  const metricsBox = (grossSf || numUnits) ? `
    <div style="border:1px solid #d0d0d0;padding:8px 12px;font-size:8pt;color:${GREY};min-width:200px">
      ${grossSf  ? `<div><strong>Total Square Feet:</strong> ${Number(grossSf).toLocaleString()}</div>` : ''}
      ${dollarPerSf  ? `<div><strong>Total $/SF:</strong> $${dollarPerSf.toFixed(2)}</div>` : ''}
      ${numUnits ? `<div><strong>Total Units:</strong> ${numUnits}</div>` : ''}
      ${dollarPerUnit ? `<div><strong>$/Unit:</strong> $${dollarPerUnit.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>` : ''}
    </div>` : '';

  const totalsRows = [
    rawLighting > 0 ? `<tr><td style="text-align:right;color:${GREY};padding:2px 8px">Subtotal — Lighting</td><td style="text-align:right;font-family:'Courier New',monospace;padding:2px 8px;min-width:100px">${esc(fmtMoney(rawLighting))}</td></tr>` : '',
    rawControls > 0 ? `<tr><td style="text-align:right;color:${GREY};padding:2px 8px">Subtotal — Controls</td><td style="text-align:right;font-family:'Courier New',monospace;padding:2px 8px">${esc(fmtMoney(rawControls))}</td></tr>` : '',
    freightAmt > 0  ? `<tr><td style="text-align:right;color:${GREY};padding:2px 8px">Freight (${(freightPctVal * 100).toFixed(0)}%)</td><td style="text-align:right;font-family:'Courier New',monospace;padding:2px 8px">${esc(fmtMoney(freightAmt))}</td></tr>` : '',
    warehousingAmt > 0 ? `<tr><td style="text-align:right;color:${GREY};padding:2px 8px">Warehousing (${(warehousingPctVal * 100).toFixed(0)}%)</td><td style="text-align:right;font-family:'Courier New',monospace;padding:2px 8px">${esc(fmtMoney(warehousingAmt))}</td></tr>` : '',
    salesTaxAmt > 0 ? `<tr><td style="text-align:right;color:${GREY};padding:2px 8px">Sales Tax (${(salesTaxPctVal * 100).toFixed(2)}%)</td><td style="text-align:right;font-family:'Courier New',monospace;padding:2px 8px">${esc(fmtMoney(salesTaxAmt))}</td></tr>` : '',
    (rawControls > 0 && rawLighting > 0) ? `
      <tr><td style="text-align:right;font-weight:600;padding:2px 8px">Subtotal Lighting (loaded)</td><td style="text-align:right;font-family:'Courier New',monospace;font-weight:600;padding:2px 8px">${esc(fmtMoney(subtotalLighting))}</td></tr>
      <tr><td style="text-align:right;font-weight:600;padding:2px 8px">Subtotal Controls (loaded)</td><td style="text-align:right;font-family:'Courier New',monospace;font-weight:600;padding:2px 8px">${esc(fmtMoney(subtotalControls))}</td></tr>` : '',
    `<tr style="border-top:2px solid ${BLACK}"><td style="text-align:right;font-weight:700;font-size:9.5pt;color:${esc(BLACK)};padding:4px 8px">Quote Total</td><td style="text-align:right;font-family:'Courier New',monospace;font-weight:700;font-size:9.5pt;color:${esc(BLACK)};padding:4px 8px">${esc(fmtMoney(grandTotal))}</td></tr>`,
    dollarPerSf ? `<tr><td style="text-align:right;color:${GREY};padding:2px 8px">$/SF</td><td style="text-align:right;font-family:'Courier New',monospace;color:${GREY};padding:2px 8px">$${dollarPerSf.toFixed(2)}</td></tr>` : '',
  ].join('');

  const locationInfo = [project.city, project.state].filter(Boolean).join(', ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, "Helvetica Neue", sans-serif; font-size: 8.5pt; color: ${BLACK}; background: white; }
    @page { size: letter landscape; margin: 0.4in 0.6in; }

    table.items-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
    table.items-table thead th { background: #2c3e50; color: white; padding: 5px 6px; text-align: left; font-size: 7pt; font-weight: 600; white-space: nowrap; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table.items-table tbody tr { border-bottom: 1px solid #e8e8e8; }
    table.items-table td { vertical-align: top; }
  </style>
</head>
<body>

<!-- ── PAGE 1 ── -->

<!-- Header -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
  <img src="https://app.ilcstudios.com/ilc-studios-logo.jpg" alt="ILC Studios" style="height:40px"/>
  <div style="text-align:right;font-size:8pt;color:${GREY};line-height:1.6">
    <div>2301 Blake Street, Ste 100 &nbsp;|&nbsp; Denver, CO 80205</div>
    <div>720-248-8208 &nbsp;|&nbsp; orders@ilcstudios.com</div>
  </div>
</div>

<hr style="border:none;border-top:1px solid #d0d0d0;margin:0 0 14px 0"/>

<!-- Info block -->
<div style="display:flex;gap:24px;margin-bottom:18px;align-items:flex-start">
  <div style="display:flex;gap:10px;align-items:flex-start">
    <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:22pt;font-weight:300;color:#888;letter-spacing:2px;margin-top:4px">Budget</div>
    <table style="border-collapse:collapse;font-size:8pt">
      <tbody>
        <tr>
          <td style="padding:1px 24px 1px 0;font-size:7pt;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.03em">Budget Number</td>
          <td style="font-size:7pt;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.03em">Budget Date</td>
        </tr>
        <tr>
          <td style="padding:0 24px 6px 0">${esc(project.budgetNumber || '—')}</td>
          <td style="padding:0 0 6px 0">${esc(budgetDate)}</td>
        </tr>
        <tr>
          <td style="padding:0 24px 0 0;font-size:7pt;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.03em">Project Name</td>
          <td style="font-size:7pt;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.03em">Client</td>
        </tr>
        <tr>
          <td style="padding:0 24px 6px 0">${esc(project.name)}</td>
          <td style="padding:0 0 6px 0">${esc(project.client?.name || '—')}</td>
        </tr>
        <tr>
          <td style="padding:0 24px 0 0;font-size:7pt;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.03em">Project Manager</td>
          <td style="font-size:7pt;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.03em">PM Email</td>
        </tr>
        <tr>
          <td style="padding:0 24px 6px 0">${esc(project.createdBy?.name || 'ILC Studios')}</td>
          <td style="padding:0 0 6px 0">${esc(project.createdBy?.email || 'orders@ilcstudios.com')}</td>
        </tr>
        ${locationInfo ? `<tr>
          <td style="padding:0 24px 0 0;font-size:7pt;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.03em">Location</td>
          <td style="font-size:7pt;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:0.03em">Phase</td>
        </tr>
        <tr>
          <td style="padding:0 24px 6px 0">${esc(locationInfo)}</td>
          <td style="padding:0 0 6px 0">${esc(PHASE_LABELS[project.phase] || project.phase || '—')}</td>
        </tr>` : ''}
      </tbody>
    </table>
  </div>

  <div style="margin-left:auto;border:1.5px solid #cc0000;padding:10px 14px;min-width:200px;max-width:240px">
    <div style="color:#cc0000;font-size:8pt;font-weight:700;line-height:1.7">
      <div>&#10003; &nbsp;For budgetary purposes only,<br/>&nbsp;&nbsp;&nbsp;&nbsp;not an offer to sell</div>
      <div>&#10003; &nbsp;Quote must be requested by<br/>&nbsp;&nbsp;&nbsp;&nbsp;client after verifying quantities</div>
    </div>
  </div>
</div>

<!-- Items table -->
<table class="items-table">
  <thead>
    <tr>
      <th style="width:4%">Type</th>
      <th style="width:${isDesignBid ? '24%' : '18%'}">Description</th>
      ${!isDesignBid ? `<th style="width:9%">Spec Mfr</th>` : ''}
      ${!isDesignBid ? `<th style="width:10%">Spec Catalog #</th>` : ''}
      <th style="width:${isDesignBid ? '15%' : '10%'};color:${ORANGE}">${isDesignBid ? 'Manufacturer' : 'ILC Proposed Mfr'}</th>
      <th style="width:${isDesignBid ? '16%' : '11%'};color:${ORANGE}">${isDesignBid ? 'Part #' : 'ILC Catalog #'}</th>
      <th style="width:4%;text-align:right">Qty</th>
      <th style="width:3%">Unit</th>
      <th style="width:7%;text-align:right">Unit $</th>
      <th style="width:9%;text-align:right">Total</th>
      <th style="width:${isDesignBid ? '13%' : '10%'}">Notes</th>
    </tr>
  </thead>
  <tbody>
    ${tableBody}
  </tbody>
</table>

${rawTotal > 0 ? `
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:16px">
  ${metricsBox}
  <table style="border-collapse:collapse"><tbody>${totalsRows}</tbody></table>
</div>` : ''}

<!-- Footer -->
<div style="margin-top:14px;padding-top:5px;border-top:1px solid #d0d0d0;display:flex;justify-content:space-between;font-size:6.5pt;color:#999">
  <span>Confidential — ILC Studios LLC &nbsp;|&nbsp; 2301 Blake Street, Ste 100, Denver, CO 80205 &nbsp;|&nbsp; 720-248-8208</span>
  <span>Printed: ${esc(printDate)}</span>
</div>

<!-- ── PAGE 2: Terms ── -->
<div style="page-break-before:always;font-size:9pt">

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
    <img src="https://app.ilcstudios.com/ilc-studios-logo.jpg" alt="ILC Studios" style="height:40px"/>
    <div style="text-align:right;font-size:7.5pt;color:${GREY};line-height:1.5">
      ILC Studios<br/>
      2301 Blake Street, Ste 100 | Denver, CO 80205<br/>
      720-248-8208 | orders@ilcstudios.com
    </div>
  </div>
  <hr style="border:none;border-top:1.5px solid ${ORANGE};margin-bottom:22px;-webkit-print-color-adjust:exact;print-color-adjust:exact"/>

  <div style="margin-bottom:24px">
    <div style="font-size:11pt;font-weight:700;color:${BLACK};border-bottom:1.5px solid ${ORANGE};padding-bottom:4px;margin-bottom:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact">General Terms</div>
    <ul style="margin:0;padding-left:18px;line-height:1.9;color:${BLACK}">
      <li>Pricing is based on a 90-day lead time from submittal.</li>
      <li>All invoices are Net 15.</li>
      <li>Warehousing/Freight estimates include 120 days of storage and 10 deliveries to the jobsite.</li>
    </ul>
  </div>

  <div style="margin-bottom:24px">
    <div style="font-size:11pt;font-weight:700;color:${BLACK};border-bottom:1.5px solid ${ORANGE};padding-bottom:4px;margin-bottom:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact">Contractor Bidding Guidelines</div>
    <div style="margin-bottom:12px"><div style="font-weight:700;margin-bottom:4px">BID BREAKOUT STRUCTURE</div>
      <div style="line-height:1.7">Contractor is to break out the lighting fixture and lighting control product package prices from labor and materials. Show the total amount for lighting fixtures as one line item and lighting controls as a separate line item.</div>
    </div>
    <div style="margin-bottom:12px"><div style="font-weight:700;margin-bottom:4px">LIGHTING CONTROLS</div>
      <div style="line-height:1.7">Bid price is provided by ILC, but formal submittals, drawings and one-lines will be provided after 100% CD.</div>
    </div>
    <div style="margin-bottom:12px"><div style="font-weight:700;margin-bottom:4px">LOW VOLTAGE &amp; LINEAR FIXTURES</div>
      <div style="line-height:1.7">Bid price is provided by ILC, but lengths and power supply takeoffs will be verified during the ordering phase by the contractor.</div>
    </div>
    <div style="margin-bottom:12px"><div style="font-weight:700;margin-bottom:4px">EGRESS/EMERGENCY LIGHTING</div>
      <div style="line-height:1.7">When emergency lighting is required and a generator is not present, ILC will provide pricing for an inverter or integral battery backups.</div>
    </div>
    <div style="margin-bottom:12px"><div style="font-weight:700;margin-bottom:4px">SALES TAX</div>
      <div style="line-height:1.7">ILC will provide a best estimate for sales tax per our physical office locations, but the bidding contractor is to adjust for any missing sales tax.</div>
    </div>
  </div>

  <div style="margin-bottom:24px">
    <div style="font-size:11pt;font-weight:700;color:${BLACK};border-bottom:1.5px solid ${ORANGE};padding-bottom:4px;margin-bottom:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact">Questions</div>
    <ul style="margin:0;padding-left:18px;line-height:1.9;color:${BLACK}">
      <li>Any questions regarding this quote should be directed to ${esc(project.createdBy?.email || 'orders@ilcstudios.com')}</li>
    </ul>
  </div>

  <div style="padding-top:5px;border-top:1px solid #d0d0d0;display:flex;justify-content:space-between;font-size:6.5pt;color:#999">
    <span>Confidential — ILC Studios LLC &nbsp;|&nbsp; 2301 Blake Street, Ste 100, Denver, CO 80205 &nbsp;|&nbsp; 720-248-8208</span>
    <span>Printed: ${esc(printDate)}</span>
  </div>

</div>

</body>
</html>`;

  try {
    const pdf = await htmlToPdf(html, { landscape: true, margin: { top: '0.4in', right: '0.6in', bottom: '0.4in', left: '0.45in' } });
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${title}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[peer-review/pdf]', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
