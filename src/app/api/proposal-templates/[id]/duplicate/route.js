import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req, { params }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const source = await prisma.proposalTemplate.findUnique({
    where: { id: params.id },
    include: { tasks: true },
  });
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const copy = await prisma.proposalTemplate.create({
    data: {
      name:           `${source.name} (Copy)`,
      type:           source.type,
      projectType:    source.projectType,
      clientType:     source.clientType,
      docBody:        source.docBody,
      milestoneSplit: source.milestoneSplit,
      defaultAdderPct: source.defaultAdderPct,
      exclusions:     source.exclusions,
      scopeMatrixRef: source.scopeMatrixRef,
      isDefault:      false,
      createdById:    user.id,
      tasks: {
        create: source.tasks.map(t => ({
          area:          t.area,
          task:          t.task,
          sortOrder:     t.sortOrder,
          srHours:       t.srHours,
          designerHours: t.designerHours,
          salesHours:    t.salesHours,
          outsourceHours: t.outsourceHours,
        })),
      },
    },
    include: { tasks: true },
  });

  return NextResponse.json(copy, { status: 201 });
}
