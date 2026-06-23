import { NextResponse } from 'next/server';
import { requireAuth, isSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { calculateBudget } from '@/lib/calculations';
import { loadPricing } from '@/lib/pricingLoader';
import { responsesToSections } from '@/lib/utils';

// GET /api/admin/projects/[id]/export
//
// Full project dump for QC. Returns everything the engine sees:
//   - The raw project row + projectData + all responses + client
//   - The pricing snapshot used (or active pricing if no snapshot)
//   - The computed budget breakdown (every section, freight, controls, totals)
//   - All input fields, including ones the summary card hides
//
// Super-admin only because it surfaces fields that aren't normally exposed
// (raw answer JSON, pricing tables, internal flags). Built so we can grab
// any project's complete state in one click for budget retests and bug
// reproductions — see the June 18 conversation that prompted this.

export async function GET(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where:   { id: params.id },
    include: {
      projectData: true,
      responses:   true,
      client:      true,
      assignees:   { include: { user: { select: { id: true, name: true, email: true } } } },
      createdBy:   { select: { id: true, name: true, email: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const pricing = project.pricingSnapshot
    ? JSON.parse(project.pricingSnapshot)
    : await loadPricing();

  const sections    = responsesToSections(project.responses);
  const projectData = { ...(project.projectData || {}), buildingTypeKey: project.buildingType };
  const budget      = calculateBudget(projectData, sections, pricing);

  // Restructure responses by section/question so a human can read them
  // without parsing the raw rows. Keeps the raw rows too for completeness.
  const responsesBySection = {};
  for (const r of project.responses) {
    if (!responsesBySection[r.section]) responsesBySection[r.section] = {};
    let parsed = r.answerValue;
    try { parsed = JSON.parse(r.answerValue); } catch { /* leave as string */ }
    responsesBySection[r.section][r.questionKey] = parsed;
  }

  return NextResponse.json({
    exportedAt:       new Date().toISOString(),
    exportedBy:       { id: user.id, name: user.name, email: user.email },
    project: {
      id:              project.id,
      name:            project.name,
      buildingType:    project.buildingType,
      location:        project.location,
      city:            project.city,
      state:           project.state,
      phase:           project.phase,
      serviceType:     project.serviceType,
      budgetType:      project.budgetType,
      budgetNumber:    project.budgetNumber,
      status:          project.status,
      createdAt:       project.createdAt,
      updatedAt:       project.updatedAt,
      pricingSnapshotPresent: !!project.pricingSnapshot,
      completedSteps:  (() => { try { return JSON.parse(project.completedSteps || '[]'); } catch { return []; } })(),
    },
    client:           project.client,
    createdBy:        project.createdBy,
    assignees:        project.assignees.map(a => a.user),
    projectData:      project.projectData,
    responsesBySection,
    rawResponses:     project.responses,
    pricing,
    budget,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
