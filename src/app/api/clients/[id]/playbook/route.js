import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

function perms(session) { try { return JSON.parse(session.permissions || '{}'); } catch { return {}; } }
function isAdmin(session) { return session.role === 'ILC_ADMIN' || session.role === 'SUPER_ADMIN'; }

// Flat ClientPlaybook columns the client may write (no id/clientId/timestamps).
const WRITABLE = [
  // §1 Account Profile
  'projectTypes', 'projectsPerYear', 'primaryMarkets', 'costTierNotes',
  'primaryContactId', 'approverContactId',
  // §2 Introductions & Onboarding
  'introOwnerContactId', 'introOwnerNote', 'onVendorList', 'vendorListNote', 'pipelineFeed', 'introNotes',
  // §3 Communication posture
  'commsPosture',
  // §6 Process & Timeframes
  'engagementTiming', 'submittalPlatform', 'coTolerance', 'mgmtStructure', 'hasDesignTeam', 'processNotes',
  'engagementLeadTime', 'budgetCadence', 'submittalTurnaround', 'typicalSdToCd', 'rfiResponseExpectation', 'timeframeNotes',
  // §4 Approvals
  'paymentTerms',
  // §5 Logistics
  'storageDuration', 'receivingPartyContactId', 'receivingPartyNote', 'freightWarehousing', 'damageInventory', 'logisticsNotes',
];

// ── GET — scalars + all normalized collections ────────────────────────────────
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const p = perms(session);
  if (!(isAdmin(session) || p.clients === true || p.clients === 'read'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [playbook, relationships, assignments, distribution, notes] = await Promise.all([
    prisma.clientPlaybook.findUnique({ where: { clientId: params.id } }),
    prisma.playbookRelationship.findMany({ where: { clientId: params.id } }),
    prisma.playbookAssignment.findMany({ where: { clientId: params.id } }),
    prisma.playbookDistribution.findMany({ where: { clientId: params.id }, orderBy: { createdAt: 'asc' } }),
    prisma.playbookNote.findMany({ where: { clientId: params.id }, orderBy: { sortOrder: 'asc' } }),
  ]);

  return NextResponse.json({ playbook: playbook || null, relationships, assignments, distribution, notes });
}

// ── PUT — partial save: only the keys present in the body are touched ──────────
// Body: { scalars?, relationships?, assignments?, distribution?, notes? }
export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(isAdmin(session) || perms(session).clients === true))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

  // 2) Relationships — upsert each provided kind (ARCHITECT/ENGINEER/GC)
  if (Array.isArray(body.relationships)) {
    for (const r of body.relationships) {
      if (!r?.kind) continue;
      const fields = {
        exists: !!r.exists, firm: r.firm || null, contactId: r.contactId || null,
        introStatus: r.introStatus || null, gcModel: r.gcModel || null, notes: r.notes || null,
      };
      await prisma.playbookRelationship.upsert({
        where: { clientId_kind: { clientId, kind: r.kind } },
        update: fields, create: { clientId, kind: r.kind, ...fields },
      });
    }
  }

  // 3) Assignments — upsert each provided role (clears contact when empty)
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

  const [playbook, relationships, assignments, distribution, notes] = await Promise.all([
    prisma.clientPlaybook.findUnique({ where: { clientId } }),
    prisma.playbookRelationship.findMany({ where: { clientId } }),
    prisma.playbookAssignment.findMany({ where: { clientId } }),
    prisma.playbookDistribution.findMany({ where: { clientId }, orderBy: { createdAt: 'asc' } }),
    prisma.playbookNote.findMany({ where: { clientId }, orderBy: { sortOrder: 'asc' } }),
  ]);
  return NextResponse.json({ playbook: playbook || null, relationships, assignments, distribution, notes });
}
