import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseLooseNumber } from '@/lib/numberInput';

const PROPOSAL_INCLUDE = {
  project: { select: { id: true, name: true, city: true, state: true, lifecycleStatus: true } },
  template: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { lineItems: true, sends: true } },
};

async function snapshotRates() {
  const rates = await prisma.proposalRate.findMany();
  const snap = {};
  for (const r of rates) snap[r.role] = r.hourlyRate;
  // fallback if rates table not seeded yet
  return Object.keys(snap).length ? snap : { SR_DESIGNER: 180, DESIGNER: 115, SALES: 160, OUTSOURCE: 115 };
}

// GET /api/proposals — list with optional filters
export async function GET(req) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status    = searchParams.get('status');
  const type      = searchParams.get('type');
  const ownerId   = searchParams.get('ownerId');
  const projectId = searchParams.get('projectId');

  const where = {};
  if (status)    where.status      = status;
  if (type)      where.type        = type;
  if (ownerId)   where.createdById = ownerId;
  if (projectId) where.projectId   = projectId;

  const proposals = await prisma.proposal.findMany({
    where,
    include: PROPOSAL_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ proposals });
}

// POST /api/proposals — create proposal + PROSPECT project (the project IS the
// pipeline row on both boards; there is no separate Deal record any more)
export async function POST(req) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json();
  const { title, type, clientId, clientName, location, templateId, projectName, projectId: existingProjectId, adderPct } = body;

  if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 });
  if (!existingProjectId && !projectName) return NextResponse.json({ error: 'projectName or projectId is required' }, { status: 400 });

  const rates            = await snapshotRates();

  const template = templateId
    ? await prisma.proposalTemplate.findUnique({
        where: { id: templateId },
        include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      })
    : null;

  const defaultMilestones = JSON.stringify([
    { label: '100% Schematic Design',         pct: 25 },
    { label: '100% Design Development',        pct: 30 },
    { label: '50% Construction Docs',          pct: 30 },
    { label: '100% Construction Docs',         pct: 10 },
    { label: 'Construction Admin (quarterly)', pct: 5  },
  ]);

  const result = await prisma.$transaction(async tx => {
    let projectRecord;

    if (existingProjectId) {
      // Attach to existing project
      projectRecord = await tx.project.findUnique({ where: { id: existingProjectId } });
      if (!projectRecord) throw new Error('Project not found');
    } else {
      // Create PROSPECT project — it IS the pipeline entity. It appears in the
      // Procurement + Design boards by serviceType; stages default to Qualified /
      // Design Qualified. No separate Deal records (merged into the project).
      projectRecord = await tx.project.create({
        data: {
          name:            projectName,
          lifecycleStatus: 'PROSPECT',
          clientId:        clientId || null,
          serviceType:     type === 'FULL_DESIGN' ? 'fullDesign' : type === 'DESIGN_ASSIST' ? 'designAssist' : 'peerReview',
          status:          'DRAFT',
          createdById:     user.id,
          salesOwnerId:    user.id,
        },
      });
    }

    const usedName = existingProjectId ? (projectRecord.name || 'Proposal') : projectName;

    // 3. Create proposal seeded from template
    const created = await tx.proposal.create({
      data: {
        projectId:     projectRecord.id,
        templateId:    templateId || null,
        type,
        status:        'DRAFT',
        title:         title || `${usedName} — ${type.replace(/_/g, ' ')}`,
        clientName:    clientName || null,
        location:      location  || null,
        docBody:       template?.docBody || '',
        adderPct:      (Number.isFinite(parseLooseNumber(adderPct)) ? parseLooseNumber(adderPct) : null) ?? template?.defaultAdderPct ?? 10,
        milestoneSplit: type === 'FULL_DESIGN'
          ? (template?.milestoneSplit || defaultMilestones)
          : null,
        rateSnapshot:  JSON.stringify(rates),
        createdById:   user.id,
        lineItems: template?.tasks?.length
          ? {
              create: template.tasks.map(t => ({
                area:          t.area,
                task:          t.task,
                sortOrder:     t.sortOrder,
                srHours:       t.srHours,
                designerHours: t.designerHours,
                salesHours:    t.salesHours,
                outsourceHours: t.outsourceHours,
              })),
            }
          : undefined,
      },
    });

    return { proposalId: created.id, project: projectRecord };
  });

  // Re-fetch with full lineItems array so EmptyState can seed the calculator
  const proposal = await prisma.proposal.findUnique({
    where: { id: result.proposalId },
    include: {
      project:   { select: { id: true, name: true, city: true, state: true, lifecycleStatus: true } },
      template:  { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      lineItems: { orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] },
      _count:    { select: { sends: true } },
    },
  });

  return NextResponse.json(proposal, { status: 201 });
}
