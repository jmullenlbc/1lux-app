import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma as db } from '@/lib/db';

// GET /api/tasks, list all tasks
export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    const tasks = await db.task.findMany({
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
      include: {
        assignee:    { select: { id: true, name: true, email: true } },
        createdBy:   { select: { id: true, name: true, email: true } },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });
    return NextResponse.json(tasks);
  } catch (err) {
    console.error('[tasks GET]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 });
  }
}

// POST /api/tasks, create a task
export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    const body = await request.json();
    const { title, description, status, priority, assigneeId, dueDate, tags } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const task = await db.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        status: status || 'TODO',
        priority: priority || 'MEDIUM',
        assigneeId: assigneeId || null,
        createdById: user.id,
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: JSON.stringify(tags || []),
      },
      include: {
        assignee:    { select: { id: true, name: true, email: true } },
        createdBy:   { select: { id: true, name: true, email: true } },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    console.error('[tasks POST]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
