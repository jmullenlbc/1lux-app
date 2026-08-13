import '@/lib/pdfPolyfill';
import { loadPdfjs } from '@/lib/pdfjsNode';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return isSuperAdmin(user.role) || project.createdById === user.id;
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

// Phase order for "only advance" check
const PHASE_ORDER = ['sd', 'dd', 'cd', 'ifc', 'construction', 'closeout'];

// Drawing tag → project phase
const TAG_TO_PHASE = {
  SD:  'sd',
  DD:  'dd',
  CD:  'cd',
  IFC: 'ifc',
  ASI: 'construction',
  RFI: 'construction',
};

// Prepend YY.MM.DD to a filename if not already present
function withDatePrefix(name) {
  if (/^\d\d\.\d\d\.\d\d/.test(name)) return name; // already has date prefix
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(2);
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const dd  = String(now.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd} ${name}`;
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

  // Store each file — prepend date prefix to displayed name
  const uploadDir = path.join(process.cwd(), 'uploads', params.id, 'drawings');
  try { await mkdir(uploadDir, { recursive: true }); } catch {}

  const createdFiles = [];
  for (const file of files) {
    if (!file || typeof file === 'string') continue;
    const buffer   = Buffer.from(await file.arrayBuffer());
    const ext      = path.extname(file.name) || '.pdf';
    const stored   = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const fileName = withDatePrefix(file.name); // ← YY.MM.DD prefix

    try { await writeFile(path.join(uploadDir, stored), buffer); } catch {}

    // Try to get page count via pdfjs
    let pageCount = null;
    try {
      const pdfjsLib = await loadPdfjs();
      const doc      = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      pageCount      = doc.numPages;
    } catch {}

    const drawingFile = await prisma.drawingFile.create({
      data: {
        submissionId: submission.id,
        fileName,
        storedPath:   path.join(params.id, 'drawings', stored),
        pageCount,
        size:         buffer.length,
        mimeType:     file.type || 'application/pdf',
      },
    });
    createdFiles.push(drawingFile);
  }

  // ── Auto-advance project phase based on drawing tag ──────────────────────
  let phaseAdvanced = null;
  const newPhase = phaseTag ? TAG_TO_PHASE[phaseTag] : null;
  if (newPhase) {
    try {
      const project = await prisma.project.findUnique({
        where:  { id: params.id },
        select: { phase: true },
      });
      const currentIdx = PHASE_ORDER.indexOf(project?.phase ?? '');
      const newIdx     = PHASE_ORDER.indexOf(newPhase);
      // Only advance — never go backward
      if (newIdx > currentIdx) {
        await prisma.project.update({
          where: { id: params.id },
          data:  { phase: newPhase },
        });
        phaseAdvanced = newPhase;
      }
    } catch {}
  }

  const result = await prisma.drawingSubmission.findUnique({
    where: { id: submission.id },
    include: SUBMISSION_INCLUDE,
  });

  return NextResponse.json({ submission: result, phaseAdvanced }, { status: 201 });
}
