import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// ── GET /api/clients/[id]/playbook ────────────────────────────────────────────
// Returns the flat ClientPlaybook record, or null if none exists yet.
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perms = (() => { try { return JSON.parse(session.permissions || '{}'); } catch { return {}; } })();
  const isAdmin = session.role === 'ILC_ADMIN' || session.role === 'SUPER_ADMIN';
  const canView = isAdmin || perms.clients === true || perms.clients === 'read';
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const playbook = await prisma.clientPlaybook.findUnique({
    where: { clientId: params.id },
  });

  return NextResponse.json(playbook || null);
}

// ── PUT /api/clients/[id]/playbook ────────────────────────────────────────────
// Body: any subset of flat ClientPlaybook fields.
// Upserts the record, touching only the fields provided.
export async function PUT(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const perms = (() => { try { return JSON.parse(session.permissions || '{}'); } catch { return {}; } })();
  const isAdmin = session.role === 'ILC_ADMIN' || session.role === 'SUPER_ADMIN';
  const canEdit = isAdmin || perms.clients === true;
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();

  // Allowlisted flat fields (no id / clientId / timestamps)
  const WRITABLE = [
    // § 1 Scope & Relationships
    'projectTypes', 'projectsPerYear', 'primaryMarkets', 'costTierNotes',
    'architectRel', 'eeRel', 'gcRel',
    'primaryContactId', 'approverContactId',
    // § 3 General Process
    'engagementTiming', 'submittalPlatform', 'coTolerance', 'mgmtStructure',
    'hasDesignTeam', 'processNotes',
    // § 4 Timeframes
    'engagementLeadTime', 'budgetCadence', 'submittalTurnaround',
    'typicalSdToCd', 'rfiResponseExpectation', 'timeframeNotes',
  ];

  const data = {};
  for (const field of WRITABLE) {
    if (field in body) data[field] = body[field] ?? null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
  }

  const playbook = await prisma.clientPlaybook.upsert({
    where:  { clientId: params.id },
    update: data,
    create: { clientId: params.id, ...data },
  });

  return NextResponse.json(playbook);
}
