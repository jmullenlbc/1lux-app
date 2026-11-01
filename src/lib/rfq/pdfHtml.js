// RFQ PDF page, laid out like the Trackvia RFQ (Mike 10-29). Server side;
// turned into a PDF by htmlToPdf in /api/projects/[id]/rfqs/[rfqId]/pdf.
import { DEFAULT_COMPANY, officeAddress, rfqLabel, rfqNotesFor, showDate, showDateTime } from './format';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const qtyText = (q) => (q == null ? '' : Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100));

export function rfqFooter(rfq) {
  return `<div style="width:100%;font-size:8px;color:#666;font-family:Arial,sans-serif;padding:0 0.5in;display:flex;justify-content:space-between">
    <span>Request for Quote ${rfqLabel(rfq)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}

export function rfqPdfHtml({ rfq, project, office, pmName, changes = [] }) {
  const phone = office?.phone || '720-248-8208';
  const mail = office?.ordersEmail || 'orders@ilcstudios.com';
  const field = (label, value) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
  const rows = rfq.lines.map((l) => `<tr>
      <td class="type">${esc(l.typeCode)}</td><td>${esc(l.manufacturer)}</td><td class="mono">${esc(l.partNumber)}</td>
      <td>${esc(l.notes)}</td><td class="num">${esc(qtyText(l.qty))}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 11px; margin: 0; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #f97316; padding-bottom: 10px; }
    .co { font-size: 15px; font-weight: bold; }
    .muted { color: #555; }
    h1 { font-size: 22px; margin: 0; letter-spacing: 1px; }
    .meta { width: 100%; border-collapse: collapse; margin: 14px 0; }
    .meta th { text-align: left; width: 22%; color: #555; font-weight: normal; padding: 3px 6px; }
    .meta td { padding: 3px 6px; font-weight: bold; }
    ul { margin: 6px 0 14px 18px; padding: 0; }
    li { margin: 2px 0; }
    table.lines { width: 100%; border-collapse: collapse; }
    table.lines th { background: #1f2937; color: #fff; text-align: left; padding: 6px; font-size: 10px; }
    table.lines td { border-bottom: 1px solid #ddd; padding: 5px 6px; vertical-align: top; }
    table.lines tr { page-break-inside: avoid; }
    td.type { font-weight: bold; }
    td.mono { font-family: Consolas, monospace; font-size: 10px; }
    .num { text-align: right; }
    .notes { margin-top: 16px; border: 1px solid #ddd; padding: 8px; min-height: 40px; white-space: pre-wrap; }
  </style></head><body>
  <div class="top">
    <div><div class="co">${esc(office?.companyName || DEFAULT_COMPANY)}</div>
      <div class="muted">${esc(officeAddress(office))}</div>
      <div class="muted">${esc(phone)} | ${esc(mail)}</div></div>
    <div style="text-align:right"><h1>REQUEST FOR QUOTE</h1><div style="font-size:14px;font-weight:bold">${rfqLabel(rfq)}</div></div>
  </div>
  <table class="meta">
    ${field('RFQ Number', rfqLabel(rfq))}
    ${field('Need Pricing By', showDateTime(rfq.needBy))}
    ${field('Sales Rep', rfq.toName)}
    ${field('Request Date', showDate(rfq.createdAt))}
    ${field('Project Name', project.name)}
    ${field('Project Manager', pmName || rfq.sentByName || '')}
    ${field('Send pricing to', office?.pricingEmail || mail)}
  </table>
  <ul>${rfqNotesFor(office).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
  ${changes.length ? `<div style="font-weight:bold">Changes since the last version</div><ul>${changes.map((c) => `<li>${esc(c.text)}</li>`).join('')}</ul>` : ''}
  <table class="lines"><thead><tr><th style="width:10%">Type</th><th style="width:18%">Manufacturer</th><th style="width:32%">Part Number</th><th>Notes</th><th class="num" style="width:9%">Qty to Quote</th></tr></thead>
    <tbody>${rows}</tbody></table>
  <div style="margin-top:16px;font-weight:bold">Additional Notes</div>
  <div class="notes">${esc(rfq.notes || '')}</div>
  </body></html>`;
}
