import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Everyone on staff can read and edit a company's playbook (Mike, 2026-09-14:
// only a short list of things is locked by department, and this isn't one).
// Contractors (Client Viewers) never can. Until 2026-09-14 both handlers below
// crashed on every call: they read `request`, `session` and `user` names that
// were never defined here.
function forbidden(user) {
  return canSeeAllData(user) ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// Flat ClientPlaybook columns the client may write (no id/clientId/timestamps).
const WRITABLE = [
  // §1 Account Profile
  'projectTypes', 'projectsPerYear', 'primaryMarkets',
  // §2 Introductions & Onboarding
  'introOwnerContactId', 'introOwnerNote', 'onVendorList', 'vendorListNote', 'pipelineFeed', 'introNotes',
  // §3 Communication posture
  'commsPosture',
  // §4 Process & Timeframes
  'engagementTiming', 'submittalPlatform', 'processNotes',
  'engagementLeadTime', 'budgetCadence', 'submittalTurnaround', 'typicalSdToCd', 'rfiResponseExpectation', 'timeframeNotes',
];

// ── GET — scalars + all normalized collections ────────────────────────────────
export async function GET(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const denied = forbidden(user);
  if (denied) return denied;

  const [playbook, assignments, distribution, notes] = await Promise.all([
    prisma.clientPlaybook.findUnique({ where: { clientId: params.id } }),
    prisma.playbookAssignment.findMany({ where: { clientId: params.id } }),
    prisma.playbookDistribution.findMany({ where: { clientId: params.id }, orderBy: { createdAt: 'asc' } }),
    prisma.playbookNote.findMany({ where: { clientId: params.id }, orderBy: { sortOrder: 'asc' } }),
  ]);

  return NextResponse.json({ playbook: playbook || null, assignments, distribution, notes });
}

// ── PUT — partial save: only the keys present in the body are touched ──────────
// Body: { scalars?, relationships?, assignments?, distribution?, notes? }
export async function PUT(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const denied = forbidden(user);
  if (denied) return denied;

  const clientId = params.id;
  const body = await req.json();

  // 1) Scalars (partial upsert — only provided fields)
  if (body.scalars && typeof body.scalars === 'object') {
    const data = {};
    for (const f of WRITABLE) if (f in body.scalars) data[f] = body.scalars[f] ?? null;
    if (Object.keys(data).length) {
      await prisma.clientPlaybook.upsert({
        where: { clientId }, update: data, create: { clientId, ...data },
      });
    }
  }

  // 2) Assignments — upsert each provided role (clears contact when empty)
  if (Array.isArray(body.assignments)) {
    for (const a of body.assignments) {
      if (!a?.role) continue;
      const fields = { contactId: a.contactId || null, note: a.note || null };
      await prisma.playbookAssignment.upsert({
        where: { clientId_role: { clientId, role: a.role } },
        update: fields, create: { clientId, role: a.role, ...fields },
      });
    }
  }

  // 4) Distribution — replace the full list for this client
  if (Array.isArray(body.distribution)) {
    await prisma.$transaction([
      prisma.playbookDistribution.deleteMany({ where: { clientId } }),
      ...body.distribution.filter(d => d?.event).map(d => prisma.playbookDistribution.create({
        data: { clientId, event: d.event, contactId: d.contactId || null, freetextName: d.freetextName || null, note: d.note || null },
      })),
    ]);
  }

  // 5) Notes — replace the full list for this client
  if (Array.isArray(body.notes)) {
    await prisma.$transaction([
      prisma.playbookNote.deleteMany({ where: { clientId } }),
      ...body.notes.filter(n => (n?.topic || n?.body)).map((n, i) => prisma.playbookNote.create({
        data: { clientId, topic: n.topic || 'Note', body: n.body || '', sortOrder: n.sortOrder ?? i },
      })),
    ]);
  }

  const [playbook, assignments, distribution, notes] = await Promise.all([
    prisma.clientPlaybook.findUnique({ where: { clientId } }),
    prisma.playbookAssignment.findMany({ where: { clientId } }),
    prisma.playbookDistribution.findMany({ where: { clientId }, orderBy: { createdAt: 'asc' } }),
    prisma.playbookNote.findMany({ where: { clientId }, orderBy: { sortOrder: 'asc' } }),
  ]);
  return NextResponse.json({ playbook: playbook || null, assignments, distribution, notes });
}
