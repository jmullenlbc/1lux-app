import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

async function authorizeSection(clientId, sectionId, user) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const isAdmin = user.role === 'ILC_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && client.createdById !== user.id)
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const section = await prisma.clientKBSection.findFirst({ where: { id: sectionId, clientId } });
  if (!section) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { section };
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await authorizeSection(params.id, params.sectionId, user);
  if (err) return err;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext    = path.extname(file.name) || '';
  const stored = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const relDir  = path.join('clients', params.id, 'kb', params.sectionId);
  const absDir  = path.join(process.cwd(), 'uploads', relDir);

  await mkdir(absDir, { recursive: true });
  await writeFile(path.join(absDir, stored), buffer);

  const attachment = await prisma.clientKBAttachment.create({
    data: {
      sectionId:    params.sectionId,
      originalName: file.name,
      storedPath:   path.join(relDir, stored).replace(/\\/g, '/'),
      mimeType:     file.type || null,
      size:         buffer.length,
    },
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
