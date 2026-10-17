import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma as db } from '@/lib/db';

// PATCH /api/tasks/[id], update a task
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id } = params;

  try {
    const body = await request.json();
    const { title, description, status, priority, assigneeId, dueDate, tags } = body;

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const data = {};
    if (title       !== undefined) data.title       = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (status      !== undefined) data.status      = status;
    if (priority    !== undefined) data.priority    = priority;
    if (assigneeId  !== undefined) data.assigneeId  = assigneeId || null;
    if (dueDate     !== undefined) data.dueDate     = dueDate ? new Date(dueDate) : null;
    if (tags        !== undefined) data.tags        = JSON.stringify(tags);

    const task = await db.task.update({
      where: { id },
      data,
      include: {
        assignee:    { select: { id: true, name: true, email: true } },
        createdBy:   { select: { id: true, name: true, email: true } },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });

    return NextResponse.json(task);
  } catch (err) {
    console.error('[tasks PATCH]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id], delete a task
export async function DELETE(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id } = params;

  try {
    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    await db.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[tasks DELETE]', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
