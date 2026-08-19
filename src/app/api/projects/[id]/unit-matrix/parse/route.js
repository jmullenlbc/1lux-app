import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import Anthropic from '@anthropic-ai/sdk';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
// Shared with the public intake route (/api/intake/parse). The extraction
// prompt and model choice live in ONE place so the internal tool and the
// public tool can never disagree about the same document.
import { xlsxToText, parseUnitMatrix } from '@/lib/drawingExtract';
import { wrapClient } from '@/lib/agent/client';

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return user.role === 'ILC_ADMIN' || user.role === 'SUPER_ADMIN' || project.createdById === user.id;
}


export async function POST(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { fileId } = await request.json();
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

  const file = await prisma.projectFile.findFirst({
    where: { id: fileId, projectId: params.id },
  });
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const ext = file.originalName.split('.').pop()?.toLowerCase();

  // Image path — not supported in Phase 1
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return NextResponse.json({ error: 'vision_not_supported' }, { status: 422 });
  }

  let contentText = null;

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await getProjectFileBuffer(file.storedPath);
    if (!buffer) return NextResponse.json({ error: 'File not found — it may have been deleted.' }, { status: 404 });
    contentText = await xlsxToText(buffer);
  } else if (ext === 'pdf') {
    // Use pre-extracted text from upload (textContent stored on file record)
    contentText = file.textContent;
    if (!contentText || contentText.trim().length < 30) {
      return NextResponse.json({ error: 'vision_not_supported' }, { status: 422 });
    }
  } else {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 422 });
  }

  const apiKey = getAnthropicKey()?.trim();
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });

  // Truncation, model choice, the prompt, code-fence stripping and shape
  // validation all live in the shared core now.
  // Recorded: see src/lib/agent/ledger.js. Deliberately a different task name
  // from the public intake route's call into the same helper — they share a
  // prompt but not a caller, and the rollup should be able to tell them apart.
  const client = wrapClient(new Anthropic({ apiKey }), 'unitMatrix.parse', { projectId: params.id, userId: user.id });
  const result = await parseUnitMatrix(contentText, file.originalName, client);
  if (!result.ok) {
    // Preserve the original error strings — UnitMatrixUpload.jsx branches on them.
    const error = result.code === 'extraction_failed' ? 'Extraction failed' : 'Could not parse extraction output';
    return NextResponse.json({ error }, { status: 502 });
  }

  return NextResponse.json({ ...result.proposal, fileId });
}
