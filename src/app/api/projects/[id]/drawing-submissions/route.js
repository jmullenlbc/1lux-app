import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return user.role === 'ILC_ADMIN' || project.createdById === user.id;
}

const SUBMISSION_INCLUDE = {
  files: { orderBy: { createdAt: 'asc' } },
};

// GET /api/projects/[id]/drawing-submissions
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!(await canAccess(params.id, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const submissions = await prisma.drawingSubmission.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: 'desc' },
    include: SUBMISSION_INCLUDE,
  });

  return NextResponse.json({ submissions });
}

// POST /api/projects/[id]/drawing-submissions
// multipart/form-data: files[], source, phaseTag?, notes?
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!(await canAccess(params.id, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const files    = formData.getAll('files');
  const source   = formData.get('source') || 'EXTERNAL';
  const phaseTag = formData.get('phaseTag') || null;
  const notes    = formData.get('notes') || null;

  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  // Create submission record first
  const submission = await prisma.drawingSubmission.create({
    data: {
      projectId:    params.id,
      phaseTag:     phaseTag || null,
      source,
      notes:        notes || null,
      uploadedById: user.id,
    },
  });

  // Store each file
  const uploadDir = path.join(process.cwd(), 'uploads', params.id, 'drawings');
  await mkdir(uploadDir, { recursive: true });

  const createdFiles = [];
  for (const file of files) {
    if (!file || typeof file === 'string') continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext    = path.extname(file.name) || '.pdf';
    const stored = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    await writeFile(path.join(uploadDir, stored), buffer);

    // Try to get page count via pdfjs
    let pageCount = null;
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc      = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      pageCount      = doc.numPages;
    } catch {}

    const drawingFile = await prisma.drawingFile.create({
      data: {
        submissionId: submission.id,
        fileName:     file.name,
        storedPath:   path.join(params.id, 'drawings', stored),
        pageCount,
        size:         buffer.length,
        mimeType:     file.type || 'application/pdf',
      },
    });
    createdFiles.push(drawingFile);
  }

  const result = await prisma.drawingSubmission.findUnique({
    where: { id: submission.id },
    include: SUBMISSION_INCLUDE,
  });

  return NextResponse.json({ submission: result }, { status: 201 });
}
