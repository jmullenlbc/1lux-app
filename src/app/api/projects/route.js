import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loadPricing } from '@/lib/pricingLoader';

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Projects are visible to all ILC staff (Mike, 2026-07). External Client Viewers
  // stay scoped to their own — never widen this to CLIENT_VIEWER.
  const where = isClientViewer(user.role)
    ? { createdById: user.id }
    : {};

  const projects = await prisma.project.findMany({
    where,
    include: {
      projectData: true,
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { responses: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ projects });
}

export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  if (isClientViewer(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { name, buildingType, location, contactEmail, budgetType, clientId, city, state, phase, serviceType } = body;

  if (!name) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  const activePricing = await loadPricing();

  // Derive location string from city/state if provided
  const locationStr = city && state
    ? `${city}, ${state}`
    : (city || state || location || null);

  const validPhases       = ['sd', 'dd', 'cd', 'ifc', 'construction', 'closeout'];
  const validServiceTypes = ['fullDesign', 'designAssist', 'peerReview', 'bidOnly', 'other'];

  // Generate next projectNumber
  const agg = await prisma.project.aggregate({ _max: { projectNumber: true } });
  const projectNumber = (agg._max.projectNumber ?? 0) + 1;

  // Generate budget number (C00001 / D00001 / B00001 per-type sequence)
  const resolvedBudgetType = ['design', 'peer_review'].includes(budgetType) ? budgetType : 'conceptual';
  const prefix = resolvedBudgetType === 'peer_review' ? 'B' : resolvedBudgetType === 'design' ? 'D' : 'C';
  const existingNums = await prisma.project.findMany({
    where: { budgetNumber: { startsWith: prefix } },
    select: { budgetNumber: true },
  });
  const maxSeq = existingNums.reduce((max, p) => {
    const n = parseInt(p.budgetNumber?.slice(1) ?? '0', 10);
    return n > max ? n : max;
  }, 0);
  const budgetNumber = `${prefix}${String(maxSeq + 1).padStart(5, '0')}`;

  const project = await prisma.project.create({
    data: {
      projectNumber,
      budgetNumber,
      name,
      buildingType:    buildingType || null,
      location:        locationStr,
      city:            city         || null,
      state:           state        || null,
      phase:           validPhases.includes(phase) ? phase : 'sd',
      serviceType:     validServiceTypes.includes(serviceType) ? serviceType : null,
      contactEmail:    contactEmail || null,
      budgetType:      resolvedBudgetType,
      currentStep:     'project-data',
      createdById:     user.id,
      clientId:        clientId     || null,
      pricingSnapshot: JSON.stringify(activePricing),
      projectData: { create: {} },
    },
    include: { projectData: true },
  });

  return NextResponse.json({ project }, { status: 201 });
}
