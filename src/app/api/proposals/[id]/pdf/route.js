import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

function fmtMoney(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// GET /api/proposals/[id]/pdf
// Returns client-safe HTML. NEVER includes internal cost data, rate snapshot, or override delta.
export async function GET(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const proposal = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: {
      project:  { select: { name: true, city: true, state: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const activeFee = proposal.overrideActive && proposal.overrideFee != null
    ? proposal.overrideFee
    : proposal.calculatedFee;

  const milestones = proposal.milestoneSplit
    ? JSON.parse(proposal.milestoneSplit)
    : [];

  // Resolve merge tokens in docBody
  const resolved = (proposal.docBody || '')
    .replace(/\{clientName\}/g,      proposal.clientName      || '—')
    .replace(/\{clientLegalName\}/g, proposal.clientLegalName || proposal.clientName || '—')
    .replace(/\{projectName\}/g,     proposal.project?.name   || '—')
    .replace(/\{location\}/g,        proposal.location        || [proposal.project?.city, proposal.project?.state].filter(Boolean).join(', ') || '—')
    .replace(/\{effectiveDate\}/g,   fmtDate(proposal.effectiveDate))
    .replace(/\{fee\}/g,             fmtMoney(activeFee))
    .replace(/\{ilcSigner\}/g,       'Jason Mullen, ILC CEO');

  const milestoneRows = milestones.map(m => `
    <tr>
      <td style="padding:8px 16px;border-bottom:1px solid #e2e8f0">${m.label}</td>
      <td style="padding:8px 16px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b">${m.pct}%</td>
      <td style="padding:8px 16px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${fmtMoney(activeFee * m.pct / 100)}</td>
    </tr>`).join('');

  const feeSection = proposal.type === 'FULL_DESIGN' && milestones.length ? `
    <div style="margin:24px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="background:#fff7ed;padding:12px 16px;border-bottom:1px solid #fed7aa">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#c2410c;font-weight:600">Total Design Fee</div>
        <div style="font-size:28px;font-weight:700;margin-top:4px">${fmtMoney(activeFee)}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px 16px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Milestone</th>
          <th style="padding:8px 16px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase">%</th>
          <th style="padding:8px 16px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase">Amount</th>
        </tr></thead>
        <tbody>${milestoneRows}</tbody>
      </table>
    </div>` : `
    <div style="margin:24px 0;border:1px solid #e2e8f0;border-radius:8px;padding:16px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#c2410c;font-weight:600">Service Fee</div>
      <div style="font-size:28px;font-weight:700;margin-top:4px">${fmtMoney(activeFee)}</div>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${proposal.title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', serif; font-size: 14px; color: #1a1a18; background: #fff; padding: 48px 64px; max-width: 800px; margin: 0 auto; }
  @media print { body { padding: 0; } @page { margin: 1in; } }
  .header { border-bottom: 2px solid #E8601C; padding-bottom: 24px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { font-size: 22px; font-weight: 700; color: #E8601C; letter-spacing: -.5px; }
  .logo span { color: #1a1a18; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; margin: 24px 0; font-size: 13px; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: #94a3b8; margin-bottom: 2px; }
  .meta-val { font-weight: 600; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #E8601C; margin: 28px 0 10px; font-family: sans-serif; }
  p { margin-bottom: 12px; line-height: 1.7; }
  .sig-block { margin-top: 48px; border-top: 1px solid #e2e8f0; padding-top: 24px; font-size: 13px; }
  .sig-line { border-top: 1px solid #64748b; width: 240px; margin-top: 40px; padding-top: 6px; font-size: 11px; color: #64748b; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">ILC<span> STUDIOS</span></div>
    <div style="font-size:11px;color:#64748b;margin-top:4px">Architectural Lighting Design</div>
  </div>
  <div style="text-align:right;font-size:11px;color:#64748b">
    <div>${fmtDate(new Date())}</div>
    <div style="margin-top:4px">${proposal.title}</div>
  </div>
</div>

<h1>${proposal.title}</h1>

<div class="meta-grid">
  <div><div class="meta-label">Client</div><div class="meta-val">${proposal.clientName || '—'}</div></div>
  <div><div class="meta-label">Project</div><div class="meta-val">${proposal.project?.name || '—'}</div></div>
  <div><div class="meta-label">Location</div><div class="meta-val">${proposal.location || '—'}</div></div>
  <div><div class="meta-label">Effective Date</div><div class="meta-val">${fmtDate(proposal.effectiveDate)}</div></div>
</div>

${resolved}

${feeSection}

<div class="sig-block">
  <div class="sig-line">Jason Mullen, CEO · ILC Studios</div>
  <div style="margin-top:32px" class="sig-line">${proposal.clientName || 'Client'} · Authorized Signatory</div>
</div>

<script>window.addEventListener('load', () => window.print());</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
