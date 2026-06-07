import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const TEMPLATE_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  tasks:     { orderBy: [{ area: 'asc' }, { sortOrder: 'asc' }] },
  _count:    { select: { proposals: true } },
};

export async function GET(req) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const type        = searchParams.get('type');
  const projectType = searchParams.get('projectType');

  const where = { isActive: true };
  if (type)        where.type        = type;
  if (projectType) where.projectType = projectType;

  const templates = await prisma.proposalTemplate.findMany({
    where,
    include: TEMPLATE_INCLUDE,
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return NextResponse.json({ templates });
}

export async function POST(req) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json();
  const {
    name, type, projectType, clientType, docBody, milestoneSplit,
    defaultAdderPct, exclusions, scopeMatrixRef, isDefault, tasks = [],
  } = body;

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 });

  // If setting as default, unset other defaults for same type+projectType
  if (isDefault) {
    await prisma.proposalTemplate.updateMany({
      where: { type, projectType: projectType || null, isDefault: true },
      data: { isDefault: false },
    });
  }

  const template = await prisma.proposalTemplate.create({
    data: {
      name, type,
      projectType:     projectType     || null,
      clientType:      clientType      || null,
      docBody:         docBody         || '',
      milestoneSplit:  milestoneSplit  || null,
      defaultAdderPct: defaultAdderPct ?? 10,
      exclusions:      exclusions      || null,
      scopeMatrixRef:  scopeMatrixRef  || null,
      isDefault:       isDefault       ?? false,
      createdById:     user.id,
      tasks: tasks.length
        ? { create: tasks.map((t, idx) => ({
            area:          t.area,
            task:          t.task,
            sortOrder:     t.sortOrder ?? idx,
            srHours:       t.srHours        || 0,
            designerHours: t.designerHours  || 0,
            salesHours:    t.salesHours     || 0,
            outsourceHours: t.outsourceHours || 0,
          })) }
        : undefined,
    },
    include: TEMPLATE_INCLUDE,
  });

  return NextResponse.json(template, { status: 201 });
}
