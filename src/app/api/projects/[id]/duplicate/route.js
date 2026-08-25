import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Load the original project
  const original = await prisma.project.findUnique({
    where: { id: params.id },
    include: { projectData: true, responses: true },
  });

  if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && original.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Build projectData fields (strip Prisma meta fields)
  const { id: _pdId, projectId: _pdProjId, createdAt: _pdCA, updatedAt: _pdUA, ...pdFields } =
    original.projectData || {};

  // Create the duplicate
  const copy = await prisma.project.create({
    data: {
      name:            `Copy of ${original.name}`,
      buildingType:    original.buildingType    || null,
      location:        original.location        || null,
      contactEmail:    original.contactEmail    || null,
      status:          'DRAFT',
      completedSteps:  original.completedSteps  || '[]',
      pricingSnapshot: original.pricingSnapshot || null,
      createdById:     user.id,
      projectData: {
        create: {
          ...pdFields,
        },
      },
    },
    include: { projectData: true },
  });

  // Copy all questionnaire responses
  if (original.responses?.length > 0) {
    await prisma.questionnaireResponse.createMany({
      data: original.responses.map(r => ({
        projectId:   copy.id,
        section:     r.section,
        questionKey: r.questionKey,
        answerValue: r.answerValue,
      })),
    });
  }

  return NextResponse.json({ project: copy }, { status: 201 });
}
