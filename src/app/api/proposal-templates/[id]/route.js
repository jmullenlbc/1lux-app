import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const TEMPLATE_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  tasks:     { orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] },
  _count:    { select: { proposals: true } },
};

export async function GET(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const template = await prisma.proposalTemplate.findUnique({
    where: { id: params.id },
    include: TEMPLATE_INCLUDE,
  });
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(template);
}

export async function PUT(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const template = await prisma.proposalTemplate.findUnique({ where: { id: params.id } });
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const {
    name, type, projectType, clientType, docBody, milestoneSplit,
    defaultAdderPct, exclusions, scopeMatrixRef, isDefault, tasks,
  } = body;

  if (isDefault) {
    await prisma.proposalTemplate.updateMany({
      where: {
        type:        type || template.type,
        projectType: projectType !== undefined ? (projectType || null) : template.projectType,
        isDefault:   true,
        NOT:         { id: params.id },
      },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.$transaction(async tx => {
    if (tasks !== undefined) {
      await tx.proposalTemplateTask.deleteMany({ where: { templateId: params.id } });
    }

    return tx.proposalTemplate.update({
      where: { id: params.id },
      data: {
        ...(name            !== undefined && { name }),
        ...(type            !== undefined && { type }),
        ...(projectType     !== undefined && { projectType: projectType || null }),
        ...(clientType      !== undefined && { clientType:  clientType  || null }),
        ...(docBody         !== undefined && { docBody }),
        ...(milestoneSplit  !== undefined && { milestoneSplit }),
        ...(defaultAdderPct !== undefined && { defaultAdderPct }),
        ...(exclusions      !== undefined && { exclusions }),
        ...(scopeMatrixRef  !== undefined && { scopeMatrixRef }),
        ...(isDefault       !== undefined && { isDefault }),
        ...(tasks !== undefined && tasks.length ? {
          tasks: {
            create: tasks.map((t, idx) => ({
              area:          t.area,
              task:          t.task,
              sortOrder:     t.sortOrder ?? idx,
              srHours:       t.srHours        || 0,
              designerHours: t.designerHours  || 0,
              salesHours:    t.salesHours     || 0,
              outsourceHours: t.outsourceHours || 0,
            })),
          },
        } : {}),
      },
      include: TEMPLATE_INCLUDE,
    });
  });

  return NextResponse.json(updated);
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await prisma.proposalTemplate.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
