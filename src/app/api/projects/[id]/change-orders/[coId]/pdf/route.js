import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProjectRates, calcGroupFooter, resolveLineItems } from '@/lib/changeOrderRates';
import { redact, audienceForRole, AUDIENCE } from '@/lib/redact';

function fmt(n, showSign = false) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (showSign && n < 0) return `(${str})`;
  if (showSign && n > 0) return `+${str}`;
  return str;
}
function pct(n) { return n != null ? `${(Number(n) * 100).toFixed(2).replace(/\.?0+$/, '')}%` : '—'; }

// GET /api/projects/[id]/change-orders/[coId]/pdf?hideInternalDN=true
export async function GET(req, { params }) {
  // This guard used to be `const { error } = await requireAuth().catch(...)` with
  // `error` never checked — requireAuth() *returns* its 401, it doesn't throw, so
  // the catch was dead code and the route served to anyone with the URL. Combined
  // with `?hideInternalDN=false` that published ILC's buy price. Enforce it.
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  // DN stays hidden by default, and un-hiding is available to ILC staff only —
  // a logged-in CLIENT_VIEWER must not be able to opt into the internal column.
  const audience       = audienceForRole(user?.role);
  const hideInternalDN = !(searchParams.get('hideInternalDN') === 'false' && audience === AUDIENCE.ILC);

  const [co, project, rates] = await Promise.all([
    prisma.changeOrder.findUnique({
      where: { id: params.coId },
      include: {
        optionGroups: {
          orderBy: { sortOrder: 'asc' },
          include: { lineItems: { orderBy: [{ sortOrder: 'asc' }] } },
        },
        createdBy: { select: { name: true, email: true } },
      },
    }),
    prisma.project.findUnique({
      where:  { id: params.id },
      select: { name: true, address: true, city: true, state: true, phase: true,
                createdBy: { select: { name: true, email: true } },
                client:    { select: { name: true } } },
    }),
    getProjectRates(params.id),
  ]);

  if (!co || co.projectId !== params.id) {
    return new Response('<h1>Not Found</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } });
  }

  const today    = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fmtDate  = d => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const location = [project?.address, project?.city && project?.state ? `${project.city}, ${project.state}` : (project?.city || project?.state)].filter(Boolean).join(', ');
  const phaseLabel = project?.phase ? project.phase.toUpperCase().replace('_', ' ') : '—';

  // Defence in depth: when DN is hidden, strip it from the data too, so a future
  // edit to the template physically cannot print it even if a guard is missed.
  const safeCo = hideInternalDN ? redact(co, AUDIENCE.CLIENT) : co;

  // Build group sections
  const groupSections = safeCo.optionGroups.map(group => {
    const footer     = calcGroupFooter(group.lineItems, rates);
    const isSelected = group.isSelected;
    const mainItems  = group.lineItems.filter(li => !li.isOptionRow);

    const rows = mainItems.map((li, idx) => {
      const totalCN = (li.qty || 0) * (li.cnUnitPrice || 0);
      const myOptions = group.lineItems.filter(o => o.isOptionRow && o.parentLineItemId === li.id);
      const bg = idx % 2 === 0 ? '#ffffff' : '#fafafa';

      const optRows = myOptions.map(o => {
        const oCN = (o.qty || 0) * (o.cnUnitPrice || 0);
        return `<tr style="background:#f0f7ff;font-style:italic;color:#64748b">
          <td style="padding-left:20px;font-size:8px">${o.optionLabel || 'Alt'}</td>
          <td colspan="2">${o.description || ''}</td>
          <td style="text-align:right">${o.qty}</td>
          <td>${o.manufacturer || ''}</td>
          <td style="font-family:monospace;font-size:8px">${o.partNumber || ''}</td>
          ${!hideInternalDN ? `<td style="text-align:right">${o.originalDN != null ? fmt(o.originalDN) : '—'}</td>` : ''}
          <td style="text-align:right">${fmt(o.cnUnitPrice)}</td>
          <td style="text-align:right;font-weight:600">${fmt(oCN, true)}</td>
          <td colspan="2"></td>
        </tr>`;
      }).join('');

      return `<tr style="background:${bg}">
        <td style="font-weight:700">${li.optionLabel ? `${li.fixtureType} <em style="font-weight:400;font-size:8px;color:#888">(${li.optionLabel})</em>` : (li.fixtureType || '')}</td>
        <td colspan="2">${li.description || ''}</td>
        <td style="text-align:right">${li.qty}</td>
        <td>${li.manufacturer || ''}</td>
        <td style="font-family:monospace;font-size:9px">${li.partNumber || ''}</td>
        ${!hideInternalDN ? `<td style="text-align:right;color:#888">${li.originalDN != null ? fmt(li.originalDN) : '—'}</td>` : ''}
        <td style="text-align:right">${fmt(li.cnUnitPrice)}</td>
        <td style="text-align:right;font-weight:700;color:${totalCN < 0 ? '#dc2626' : '#231F20'}">${fmt(totalCN, true)}</td>
        <td style="font-size:8px">${li.quoteReference || ''}</td>
        <td style="font-size:8px">${li.leadTime || ''}</td>
      </tr>${optRows}`;
    }).join('');

    const subtotalRow = `<tr style="background:#f9fafb">
      <td colspan="${hideInternalDN ? 7 : 8}" style="text-align:right;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;padding:5px 6px">
        ${group.label} Subtotal
      </td>
      <td style="text-align:right;font-weight:700;padding:5px 6px;border-top:1px solid #e5e7eb">${fmt(footer.subtotal, true)}</td>
      <td colspan="2" style="border-top:1px solid #e5e7eb"></td>
    </tr>`;

    return `
      <tr style="background:#FFF8F0">
        <td colspan="${hideInternalDN ? 11 : 12}" style="color:#F7941D;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.08em;padding:7px 6px;border-bottom:1px solid #F7941D">
          ${group.label}${isSelected ? ' <span style="background:#231F20;color:#fff;font-size:7px;font-weight:700;padding:1px 6px;border-radius:99px;letter-spacing:.06em;text-transform:uppercase;margin-left:6px">SELECTED</span>' : ''}
        </td>
      </tr>
      ${rows}
      ${subtotalRow}`;
  }).join('');

  // Calculate totals from selected group
  const selected = safeCo.optionGroups.find(g => g.isSelected) || safeCo.optionGroups[0];
  const selectedFooter = selected ? calcGroupFooter(selected.lineItems, rates) : { subtotal: 0, tax: 0, freight: 0, warehousing: 0, total: 0 };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${co.coNumber} — ${co.title}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; color:#231F20; background:#fff; }
@media print {
  body { font-size:9.5px; }
  @page { margin:15mm 12mm; }
  .no-print { display:none !important; }
  .page-break { page-break-before:always; }
}
.page { padding:24px; max-width:1100px; margin:0 auto; }

/* ── Header ── */
.header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #F7941D; padding-bottom:14px; margin-bottom:18px; }
.logo { font-size:28px; font-weight:900; letter-spacing:-.02em; color:#231F20; line-height:1; }
.logo-ilc { color:#F7941D; }
.logo-tag { font-size:8px; color:#888; font-weight:400; letter-spacing:.02em; margin-top:3px; }
.contact-block { text-align:right; font-size:9px; color:#555; line-height:1.7; }

/* ── Meta ── */
.meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 32px; margin-bottom:18px; max-width:420px; }
.meta-item label { font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#999; display:block; margin-bottom:1px; }
.meta-item span { font-size:11px; font-weight:600; }

/* ── Status badge ── */
.status-badge { display:inline-block; padding:3px 10px; border-radius:99px; font-size:8px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
.status-DRAFT { background:#fef3c7; color:#92400e; }
.status-SENT { background:#dbeafe; color:#1e40af; }
.status-APPROVED { background:#d1fae5; color:#065f46; }

/* ── Table ── */
table { width:100%; border-collapse:collapse; margin-bottom:0; }
thead tr { background:#231F20; }
th { padding:6px 6px; text-align:left; font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#fff; white-space:nowrap; }
td { padding:5px 6px; border-bottom:1px solid #f0f0f0; vertical-align:top; font-size:9.5px; }

/* ── Footer summary ── */
.footer-table { width:280px; margin-left:auto; border-collapse:collapse; margin-top:20px; }
.footer-table td { padding:4px 8px; font-size:10px; }
.footer-table .lbl { text-align:right; color:#555; }
.footer-table .val { text-align:right; font-family:monospace; }
.footer-table .bold td { font-weight:700; font-size:11px; border-top:1px solid #e5e7eb; padding-top:6px; }
.footer-table .grand td { background:#F7941D; color:#fff; font-weight:900; font-size:13px; padding:8px; }

/* ── Notes box ── */
.notes-box { background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:10px 14px; font-size:9.5px; color:#78350f; margin-bottom:16px; }

/* ── Terms page ── */
.terms-section { margin-bottom:20px; }
.terms-section h2 { font-size:13px; font-weight:700; color:#231F20; margin-bottom:8px; padding-bottom:6px; border-bottom:2px solid #F7941D; }
.terms-section h3 { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#231F20; margin:12px 0 4px; }
.terms-section p { font-size:9.5px; color:#444; line-height:1.6; margin-bottom:4px; padding-left:12px; }
.terms-section ul { padding-left:24px; }
.terms-section ul li { font-size:9.5px; color:#444; line-height:1.6; margin-bottom:2px; }

/* ── Page footer ── */
.page-footer { margin-top:20px; border-top:1px solid #e5e7eb; padding-top:6px; display:flex; justify-content:space-between; font-size:8px; color:#999; }
</style>
</head>
<body>

<!-- PAGE 1: Change Order -->
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="logo"><span class="logo-ilc">ILC</span>STUDIOS</div>
      <div class="logo-tag">Lighting Design + Procurement</div>
    </div>
    <div class="contact-block">
      2301 Blake Street, Ste 100 | Denver, CO 80205<br>
      720-248-8208 | orders@ilcstudios.com
    </div>
  </div>

  <!-- Meta -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
    <div class="meta-grid">
      <div class="meta-item"><label>Change Order</label><span>${co.coNumber}</span></div>
      <div class="meta-item"><label>Date</label><span>${fmtDate(co.date)}</span></div>
      <div class="meta-item"><label>Project Name</label><span>${project?.name || '—'}</span></div>
      <div class="meta-item"><label>Client</label><span>${project?.client?.name || '—'}</span></div>
      <div class="meta-item"><label>Project Manager</label><span>${project?.createdBy?.name || '—'}</span></div>
      <div class="meta-item"><label>PM Email</label><span>${project?.createdBy?.email || '—'}</span></div>
      <div class="meta-item"><label>Location</label><span>${location || '—'}</span></div>
      <div class="meta-item"><label>Phase</label><span>${phaseLabel}</span></div>
    </div>
    <div style="text-align:right">
      <div style="font-size:10px;font-weight:600;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Title</div>
      <div style="font-size:14px;font-weight:700;color:#231F20;margin-bottom:8px">${co.title}</div>
      <span class="status-badge status-${co.status}">${co.status}</span>
    </div>
  </div>

  ${co.notes ? `<div class="notes-box"><strong>Notes:</strong> ${co.notes}</div>` : ''}

  <!-- Line items table -->
  <table>
    <thead>
      <tr>
        <th>Type</th>
        <th colspan="2">Description</th>
        <th style="text-align:right">Qty</th>
        <th>ILC Proposed Mfr</th>
        <th>ILC Catalog #</th>
        ${!hideInternalDN ? '<th style="text-align:right">Orig DN</th>' : ''}
        <th style="text-align:right">Unit $</th>
        <th style="text-align:right">Total</th>
        <th>Quote Ref</th>
        <th>Lead Time</th>
      </tr>
    </thead>
    <tbody>
      ${groupSections}
    </tbody>
  </table>

  <!-- Pricing footer — matches budget style -->
  <table class="footer-table">
    <tbody>
      <tr><td class="lbl">Subtotal</td><td class="val">${fmt(selectedFooter.subtotal)}</td></tr>
      ${rates.freightPct ? `<tr><td class="lbl">Freight (${pct(rates.freightPct)})</td><td class="val">${fmt(selectedFooter.freight)}</td></tr>` : ''}
      ${rates.warehousingPct ? `<tr><td class="lbl">Warehousing (${pct(rates.warehousingPct)})</td><td class="val">${fmt(selectedFooter.warehousing)}</td></tr>` : ''}
      ${rates.salesTaxPct ? `<tr><td class="lbl">Sales Tax (${pct(rates.salesTaxPct)})</td><td class="val">${fmt(selectedFooter.tax)}</td></tr>` : ''}
      <tr class="grand"><td colspan="2" style="text-align:right;padding:8px 8px">Change Order Total &nbsp;&nbsp; ${fmt(selectedFooter.total, true)}</td></tr>
    </tbody>
  </table>

  <div class="page-footer">
    <span>Confidential — ILC Studios LLC | 2301 Blake Street, Ste 100, Denver, CO 80205 | 720-248-8208</span>
    <span>Printed: ${today}</span>
  </div>
</div>

<!-- PAGE 2: Terms (same as budget) -->
<div class="page page-break">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="logo"><span class="logo-ilc">ILC</span>STUDIOS</div>
      <div class="logo-tag">Lighting Design + Procurement</div>
    </div>
    <div class="contact-block">
      2301 Blake Street, Ste 100 | Denver, CO 80205<br>
      720-248-8208 | orders@ilcstudios.com
    </div>
  </div>

  <div class="terms-section">
    <h2>General Terms</h2>
    <ul>
      <li>Sales tax is included on this change order. We can remove this at future submissions if the tax will be covered by the contractor.</li>
      <li>20% mobilization is required upon acceptance of quotation.</li>
      <li>Pricing is based on a 90-day lead time from submittal.</li>
      <li>All invoices are Net 15.</li>
      <li>Warehousing/Freight estimates include 120 days of storage and 10 deliveries to the jobsite.</li>
    </ul>
  </div>

  <div class="terms-section">
    <h2>Change Order Guidelines</h2>

    <h3>Pricing Basis</h3>
    <p>All unit prices are ILC's net client pricing, inclusive of applicable freight, warehousing, and sales tax as shown in the footer above. Pricing reflects current manufacturer pricing at time of submittal and is subject to change if the order is not placed within 90 days.</p>

    <h3>Bid Breakout Structure</h3>
    <p>Contractor is to break out the lighting fixture and lighting control product package prices from labor and materials. Show the total amount for lighting fixtures as one line item and lighting controls as a separate line item.</p>

    <h3>Low Voltage &amp; Linear Fixtures</h3>
    <p>Bid price is provided by ILC, but lengths and power supply takeoffs will be verified during the ordering phase by the contractor.</p>

    <h3>Egress / Emergency Lighting</h3>
    <p>When emergency lighting is required and a generator is not present, ILC will provide pricing for an inverter or integral battery backups.</p>

    <h3>Sales Tax</h3>
    <p>ILC will provide a best estimate for sales tax per our physical office locations, but the bidding contractor is to adjust for any missing sales tax.</p>
  </div>

  <div class="terms-section">
    <h2>Questions</h2>
    <p>Any questions regarding this change order should be directed to ${project?.createdBy?.email || 'orders@ilcstudios.com'}</p>
  </div>

  <div class="page-footer">
    <span>Confidential — ILC Studios LLC | 2301 Blake Street, Ste 100, Denver, CO 80205 | 720-248-8208</span>
    <span>Printed: ${today}</span>
  </div>
</div>

<script>window.onload = () => window.print();</script>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
