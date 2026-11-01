import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PM_SELECT, pmPrint } from '@/lib/projectManagers';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABELS = {
  NOT_ORDERED:        'Not Ordered',
  PO_PLACED:          'PO Placed',
  IN_TRANSIT:         'In Transit',
  AT_WAREHOUSE:       'At Warehouse',
  PARTIALLY_RELEASED: 'Partially Released',
  RELEASED:           'Released',
  DELIVERED:          'Delivered',
  UNDER_REVIEW:       'Under Review',
  REMOVED:            'Removed',
};

// GET /api/projects/[id]/ship-schedule/pdf, ILC-branded print-ready HTML
export async function GET(req, { params }) {
  const { error } = await requireAuth();
  if (error) return new Response('Unauthorized', { status: 401 });

  const [project, shipments, releases] = await Promise.all([
    prisma.project.findUnique({
      where:  { id: params.id },
      select: { name: true, city: true, state: true, buildingType: true, phase: true,
                assignees: PM_SELECT,
                client:    { select: { name: true } } },
    }),
    prisma.shipment.findMany({
      where:   { project_id: params.id },
      include: { lineItems: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    }),
    prisma.warehouseRelease.findMany({
      where:  { lineItem: { shipment: { project_id: params.id } } },
      select: { lineItemId: true, qty: true },
    }),
  ]);

  const pms = pmPrint(project?.assignees);

  const releaseTotals = {};
  for (const r of releases) releaseTotals[r.lineItemId] = (releaseTotals[r.lineItemId] || 0) + r.qty;

  const allItems = shipments
    .flatMap(s => (s.lineItems || []).map(li => ({ ...li })))
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || (a.fixtureType || '').localeCompare(b.fixtureType || ''));

  const activeItems  = allItems.filter(i => !i.isRemoved);
  const removedItems = allItems.filter(i => i.isRemoved);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const location = [project?.city, project?.state].filter(Boolean).join(', ');
  const phaseLabel = project?.phase ? project.phase.toUpperCase().replace('_', ' ') : '—';

  const totalOrdered  = activeItems.reduce((s, i) => s + (i.qty || 0), 0);
  const totalReleased = activeItems.reduce((s, i) => s + (releaseTotals[i.id] || 0), 0);
  const totalRemaining = activeItems.reduce((s, i) => s + Math.max(0, (i.qty || 0) - (releaseTotals[i.id] || 0)), 0);

  function rowsHtml(items, isRemoved = false) {
    return items.map((item, idx) => {
      const released  = releaseTotals[item.id] || 0;
      const remaining = Math.max(0, (item.qty || 0) - released);
      const bg = isRemoved ? '#f8f8f8' : idx % 2 === 0 ? '#ffffff' : '#fafafa';
      const color = isRemoved ? '#aaa' : '#231F20';
      return `<tr style="background:${bg};color:${color}">
        <td style="font-weight:600">${item.fixtureType || ''}</td>
        <td>${item.description || ''}</td>
        <td>${item.propManufacturer || '—'}</td>
        <td style="font-family:monospace;font-size:9px">${item.propModel || '—'}</td>
        <td style="text-align:right;font-weight:600">${item.qty ?? '—'}</td>
        <td style="text-align:right;color:${released > 0 ? '#0369a1' : '#aaa'}">${released || '—'}</td>
        <td style="text-align:right;color:${remaining === 0 && released > 0 ? '#15803d' : remaining > 0 ? '#231F20' : '#aaa'}">${remaining || (item.qty ? '0' : '—')}</td>
        <td>${STATUS_LABELS[item.fixtureStatus] || (item.fixtureStatus || '—')}</td>
        <td style="font-size:9px">${item.sourceBatchLabel || '—'}</td>
        <td style="font-family:monospace;font-size:9px">${item.catalogNo || '—'}</td>
        <td style="text-align:right">${item.leadTimeWeeks ? item.leadTimeWeeks + ' wks' : '—'}</td>
        <td>${item.esdDate ? fmtDate(item.esdDate) : '—'}</td>
        <td style="font-size:9px">${item.trackingNumber || ''}</td>
        <td style="font-size:9px;color:#666">${item.notes || ''}</td>
      </tr>`;
    }).join('');
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Ship Schedule: ${project?.name || ''}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Helvetica Neue',Arial,sans-serif; font-size:9px; color:#231F20; background:#fff; }
@media print {
  body { font-size:8.5px; }
  @page { margin:12mm 10mm; size:landscape; }
  .no-print { display:none !important; }
}
.page { padding:20px; max-width:1400px; margin:0 auto; }

/* ── Header ── */
.header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #F7941D; padding-bottom:12px; margin-bottom:16px; }
.logo { font-size:26px; font-weight:900; letter-spacing:-.02em; color:#231F20; line-height:1; }
.logo-ilc { color:#F7941D; }
.logo-tag { font-size:8px; color:#888; font-weight:400; letter-spacing:.02em; margin-top:3px; }
.contact-block { text-align:right; font-size:8px; color:#555; line-height:1.6; }

/* ── Meta grid ── */
.meta-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:16px; margin-bottom:16px; }
.meta-item label { display:block; font-size:7.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#999; margin-bottom:2px; }
.meta-item span { font-size:10px; font-weight:600; color:#231F20; }

/* ── Summary stats ── */
.stats { display:flex; gap:16px; margin-bottom:16px; }
.stat-box { border:1px solid #e5e7eb; border-radius:6px; padding:8px 14px; }
.stat-box .lbl { font-size:7.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#999; margin-bottom:2px; }
.stat-box .val { font-size:14px; font-weight:700; color:#231F20; }

/* ── Table ── */
table { width:100%; border-collapse:collapse; }
thead tr { background:#231F20; }
th { padding:5px 6px; text-align:left; font-size:7.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#fff; white-space:nowrap; }
td { padding:4px 6px; border-bottom:1px solid #f0f0f0; vertical-align:top; }
.section-row td { background:#FFF8F0; color:#F7941D; font-weight:700; font-size:8px; text-transform:uppercase; letter-spacing:.08em; padding:6px 6px; border-bottom:1px solid #F7941D; }

/* ── Footer ── */
.page-footer { margin-top:20px; border-top:1px solid #e5e7eb; padding-top:6px; display:flex; justify-content:space-between; font-size:7.5px; color:#999; }
</style>
</head>
<body>
<div class="page">

  <!-- ILC Header -->
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

  <!-- Project meta -->
  <div class="meta-grid">
    <div class="meta-item"><label>Project Name</label><span>${project?.name || '—'}</span></div>
    <div class="meta-item"><label>Client</label><span>${project?.client?.name || '—'}</span></div>
    <div class="meta-item"><label>Project Manager</label><span>${pms.names || '—'}</span></div>
    <div class="meta-item"><label>Date</label><span>${today}</span></div>
    <div class="meta-item"><label>Location</label><span>${location || '—'}</span></div>
    <div class="meta-item"><label>Phase</label><span>${phaseLabel}</span></div>
    <div class="meta-item"><label>PM Email</label><span>${pms.emails || '—'}</span></div>
  </div>

  <!-- Summary stats -->
  <div class="stats">
    <div class="stat-box"><div class="lbl">Fixture Types</div><div class="val">${activeItems.length}</div></div>
    <div class="stat-box"><div class="lbl">Total Ordered</div><div class="val">${totalOrdered}</div></div>
    <div class="stat-box"><div class="lbl">Released</div><div class="val">${totalReleased}</div></div>
    <div class="stat-box"><div class="lbl">Remaining</div><div class="val">${totalRemaining}</div></div>
  </div>

  <!-- Main table -->
  <table>
    <thead>
      <tr>
        <th>Type</th><th>Description</th><th>Manufacturer</th><th>Part #</th>
        <th style="text-align:right">Ordered</th><th style="text-align:right">Released</th>
        <th style="text-align:right">Remaining</th><th>Status</th>
        <th>Batch / PO</th><th>PO #</th>
        <th style="text-align:right">Lead (Wks)</th><th>ESD</th><th>Tracking #</th><th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${activeItems.length > 0 ? `
        <tr class="section-row"><td colspan="14">Active: ${activeItems.length} Type${activeItems.length !== 1 ? 's' : ''}</td></tr>
        ${rowsHtml(activeItems)}
      ` : '<tr><td colspan="14" style="text-align:center;padding:20px;color:#aaa;font-style:italic">No items in ship schedule</td></tr>'}
      ${removedItems.length > 0 ? `
        <tr class="section-row"><td colspan="14">Removed from Bid: ${removedItems.length} Type${removedItems.length !== 1 ? 's' : ''}</td></tr>
        ${rowsHtml(removedItems, true)}
      ` : ''}
    </tbody>
  </table>

  <!-- Page footer -->
  <div class="page-footer">
    <span>Confidential: ILC Studios LLC | 2301 Blake Street, Ste 100, Denver, CO 80205 | 720-248-8208</span>
    <span>Printed: ${today}</span>
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
