import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import * as XLSX from 'xlsx';
import { STANDARDS_SECTIONS, CCT_INTERIOR_AREAS, resolveAnswer } from '@/lib/standards-questions';
import { PLAYBOOK_CONTENT, fillClientName } from '@/lib/playbookContent';

// Small label maps mirrored from PlaybookTab (kept local so this server route
// never imports client-component code).
const CO_TOLERANCE = { TIGHT: 'Tight — minimize COs', NORMAL: 'Normal process', FLEXIBLE: 'Flexible as needed' };
const MGMT_STRUCT  = { CENTRAL: 'Centralized — all from HQ', REGIONAL: 'Regional PM has authority', MIXED: 'Mixed — regional design, HQ budget' };

const PLAYBOOK_SECTIONS = [
  { id: 'general',    label: 'General / Cadence' },
  { id: 'contracts',  label: 'Contacts / Accounting / Contracts' },
  { id: 'approvals',  label: 'Approvals' },
  { id: 'process',    label: 'Process' },
  { id: 'timeframes', label: 'Expected Timeframes' },
  { id: 'softcost',   label: 'Soft Cost Ranges' },
  { id: 'precon',     label: 'Pre-con + Bidding' },
  { id: 'buyout',     label: 'Buyout + Ordering' },
  { id: 'rfis',       label: "RFI's + Change Orders" },
];

// GET /api/clients/[id]/export — workbook with Standards + Playbook tabs
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const client = await prisma.client.findUnique({
    where:   { id: params.id },
    include: { contacts: true },
  });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && client.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const answers  = await prisma.clientStandardsAnswer.findMany({ where: { clientId: client.id } });
  const playbook = await prisma.clientPlaybook.findUnique({ where: { clientId: client.id } }).catch(() => null);
  const pbAssignments  = await prisma.playbookAssignment.findMany({ where: { clientId: client.id } }).catch(() => []);
  const pbDistribution = await prisma.playbookDistribution.findMany({ where: { clientId: client.id } }).catch(() => []);
  const asg = Object.fromEntries(pbAssignments.map(a => [a.role, a.contactId]));

  const rec  = (k) => resolveAnswer(answers, k, '', '');
  const val  = (k) => rec(k)?.answer_value || '';
  const note = (k) => rec(k)?.answer_note  || '';

  // ── Standards sheet ──
  const stdRows = [
    ['CLIENT LIGHTING STANDARDS'],
    [client.name],
    [],
    ['Section', 'Question', 'Answer', 'Note'],
  ];
  stdRows.push(['Color Temperature', 'All Interior (default)', val('cct_all_interior'), '']);
  stdRows.push(['Color Temperature', 'Exterior', val('cct_exterior'), '']);
  for (const a of CCT_INTERIOR_AREAS) {
    const v = val(a.key);
    if (v) stdRows.push(['Color Temperature', a.label, v, '']);
  }
  for (const s of STANDARDS_SECTIONS) {
    if (s.isCCT || !s.questions?.length) continue;
    for (const q of s.questions) {
      stdRows.push([s.label, q.label, val(q.key), note(q.key)]);
    }
  }
  const stdSheet = XLSX.utils.aoa_to_sheet(stdRows);
  stdSheet['!cols'] = [{ wch: 26 }, { wch: 42 }, { wch: 32 }, { wch: 32 }];

  // ── Playbook sheet ──
  const pbRows = [
    ['CLIENT PLAYBOOK — HOW WE WORK TOGETHER'],
    [client.name],
    [],
    ['Section', 'Item', 'Detail'],
  ];

  function flatten(sectionLabel, items, depth) {
    for (const it of items) {
      const indent = '   '.repeat(depth);
      pbRows.push([
        depth === 0 ? sectionLabel : '',
        indent + fillClientName(it.text, client.name),
        fillClientName(it.body || it.meta || '', client.name),
      ]);
      if (it.children?.length) flatten(sectionLabel, it.children, depth + 1);
    }
  }

  const roleName = (id) => { const c = client.contacts.find(x => x.id === id); return c ? (c.email ? `${c.name} (${c.email})` : c.name) : ''; };

  for (const sec of PLAYBOOK_SECTIONS) {
    let wrote = false;

    if (sec.id === 'contracts') {
      const terms      = playbook?.paymentTerms;
      const primary    = roleName(playbook?.primaryContactId);
      const push = (label, val) => { if (val) { pbRows.push([wrote ? '' : sec.label, label, val]); wrote = true; } };
      if (terms) { pbRows.push([sec.label, 'Payment terms', terms]); wrote = true; }
      push('Primary national contact', primary);
      push('Invoices sent to (standards)', roleName(asg.INVOICING_STANDARDS));
      push('Invoices sent to (project)',   roleName(asg.INVOICING_PROJECT));
      push('Standards proposal signer',    roleName(asg.PROPOSAL_SIGNER_STANDARDS));
      push('Project proposal signer',      roleName(asg.PROPOSAL_SIGNER_PROJECT));
      push('Project contract signer',      roleName(asg.CONTRACT_SIGNER));
      const recips = pbDistribution.filter(d => d.event === 'BUDGETS')
        .map(d => roleName(d.contactId) || d.freetextName).filter(Boolean);
      push('Budget submission recipients', recips.join('; '));
      push('Design-team intro handled by', roleName(asg.DESIGN_INTRO));
      push('GC intro handled by',          roleName(asg.GC_INTRO));
    }
    if (sec.id === 'process' && playbook) {
      if (playbook.processNotes) { pbRows.push([sec.label, 'Notes', playbook.processNotes]); wrote = true; }
    }

    const content = PLAYBOOK_CONTENT[sec.id];
    if (content?.items?.length) {
      // If form rows already used the section label, start content rows without repeating it.
      if (wrote) { pbRows.push(['', '— Standard process —', '']); flatten('', content.items, 0); }
      else flatten(sec.label, content.items, 0);
    }

    pbRows.push([]); // spacer between sections
  }
  const pbSheet = XLSX.utils.aoa_to_sheet(pbRows);
  pbSheet['!cols'] = [{ wch: 26 }, { wch: 50 }, { wch: 64 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, stdSheet, 'Standards');
  XLSX.utils.book_append_sheet(wb, pbSheet, 'Playbook');

  const buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const safeName = (client.name || 'Client').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
  const filename = `${safeName}_Standards_Playbook.xlsx`;

  return new NextResponse(buf, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function safeParse(v) {
  try { return JSON.parse(v); } catch { return []; }
}
