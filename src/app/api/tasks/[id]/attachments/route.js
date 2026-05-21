import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import db from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
];
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const task = await db.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: 'File too large (max 25 MB)' }, { status: 400 });

  const buffer   = Buffer.from(await file.arrayBuffer());
  const ext      = path.extname(file.name) || '';
  const stored   = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const relDir   = path.join('tasks', params.id);
  const absDir   = path.join(process.cwd(), 'uploads', relDir);

  await mkdir(absDir, { recursive: true });
  await writeFile(path.join(absDir, stored), buffer);

  const attachment = await db.taskAttachment.create({
    data: {
      taskId:       params.id,
      originalName: file.name,
      storedPath:   path.join(relDir, stored).replace(/\\/g, '/'),
      mimeType:     file.type || null,
      size:         buffer.length,
    },
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
