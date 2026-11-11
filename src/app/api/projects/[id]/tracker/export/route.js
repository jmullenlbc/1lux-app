import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import * as XLSX from 'xlsx';
import { canAccessProject } from '@/lib/submittalTracker';
import { statusLabel } from '@/lib/submittalStatus';

const PARTY = { ARCH: 'Architect', EE: 'Electrical Engineer', ID: 'Interior Designer', CONTRACTOR: 'Contractor', ILC: '1LUX', OWNERSHIP: 'Ownership' };
const RESPONSE = { DRAFT: 'Draft', APPROVED: 'Approved', SENT: 'Sent' };
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// GET, the approval tracker as Excel (0146): one row per fixture type with
// each reviewer's latest status, every live review with its ILC response,
// and the open items. Archived rows are left out.
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccessProject(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const live = { archivedAt: null };
  const [project, tracker, openItems] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.id }, select: { name: true } }),
    prisma.submittalTracker.findUnique({
      where: { projectId: params.id },
      include: {
        submissions: { where: live, orderBy: { createdAt: 'asc' } },
        items: {
          where: live,
          orderBy: { sortOrder: 'asc' },
          include: {
            versions: {
              where: { submission: live },
              orderBy: { createdAt: 'asc' },
              include: { submission: true, reviews: { where: live, orderBy: { createdAt: 'asc' }, include: { response: true } } },
            },
          },
        },
      },
    }),
    prisma.submittalOpenItem.findMany({ where: { projectId: params.id, closedRound: null }, orderBy: [{ responsibleParty: 'asc' }, { typeCode: 'asc' }] }),
  ]);
  if (!tracker) return NextResponse.json({ error: 'This project has no approval tracker yet, so there is nothing to export. Create the tracker first. (TRACKER_EXPORT_NONE)' }, { status: 404 });

  const roles = JSON.parse(tracker.reviewerRoles || '[]');
  const roundOf = Object.fromEntries(tracker.submissions.map((s, i) => [s.id, i + 1]));

  const summary = [['Type', 'Description', 'Location', 'Manufacturer', 'Model', ...roles]];
  const reviews = [['Type', 'Round', 'Submission', 'Reviewer', 'Name', 'Status', 'Date', 'Notes', 'ILC response', 'Response status', 'Sent']];
  for (const item of tracker.items) {
    const latest = {};
    const last = item.versions[item.versions.length - 1];
    for (const ver of item.versions) {
      for (const r of ver.reviews) {
        latest[r.reviewerRole] = r.status;
        reviews.push([
          item.typeCode, roundOf[ver.submissionId] || '', ver.submission?.name || '',
          r.reviewerRole, r.reviewerName || '', statusLabel(r.status), r.dateNoted || '', r.notes || '',
          r.response?.body || '', RESPONSE[r.response?.status] || '', day(r.response?.sentAt),
        ]);
      }
    }
    summary.push([item.typeCode, item.description || '', item.location || '', last?.manufacturer || '', last?.modelNumber || '', ...roles.map((k) => (latest[k] ? statusLabel(latest[k]) : ''))]);
  }
  const open = [['Responsible party', 'Type', 'Category', 'Note', 'Opened round', 'Repeat']];
  for (const o of openItems) open.push([PARTY[o.responsibleParty] || o.responsibleParty, o.typeCode, o.noteCategory, o.noteText, o.openedRound, o.isRepeat ? 'Yes' : '']);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Tracker');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reviews), 'Reviews');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(open), 'Open items');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const safe = (project?.name || 'Project').replace(/[^A-Za-z0-9 _.]+/g, '').trim().replace(/\s+/g, '_') || 'Project';
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safe}_Approval_Tracker_${day(new Date())}.xlsx"`,
    },
  });
}
