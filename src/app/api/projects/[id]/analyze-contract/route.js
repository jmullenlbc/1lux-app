import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import path from 'path';
import { CONTRACT_SYSTEM_PROMPT } from '@/lib/contractSystemPrompt';

// Allow up to 5 minutes — large scanned PDFs can take 3–4 min
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/projects/[id]/analyze-contract
// Body: { fileId } — ID of an already-uploaded ProjectFile (PDF)
// OR:   FormData with field "file" — an uploaded PDF (for direct review without saving)
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // textContent = pre-extracted text from upload (fast path)
  // pdfBase64   = raw PDF binary (slow fallback for scanned/image PDFs)
  let textContent = null;
  let pdfBase64   = null;
  let fileName    = 'contract.pdf';
  let savedFileId = null;

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body   = await request.json();
    const fileId = body.fileId;
    if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

    const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
    if (!file || file.projectId !== params.id) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    fileName    = file.originalName;
    savedFileId = fileId;

    if (file.textContent && file.textContent.length > 100) {
      // Fast path: use pre-extracted text — no disk read, no base64, ~10× faster
      textContent = file.textContent;
    } else {
      // Slow path: scanned/image PDF — send binary to Claude vision
      let buffer;
      try {
        buffer = await readFile(path.join(process.cwd(), 'uploads', file.storedPath));
      } catch {
        return NextResponse.json({ error: 'File not found on disk — it may have been deleted.' }, { status: 404 });
      }
      pdfBase64 = buffer.toString('base64');
    }

  } else {
    // FormData direct upload — extract text on the fly, fall back to binary
    const formData = await request.formData();
    const file     = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    fileName     = file.name;

    // Try to extract text first
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc      = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      let   text     = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page    = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n';
      }
      if (text.trim().length > 100) textContent = text.trim();
    } catch {}

    if (!textContent) pdfBase64 = buffer.toString('base64');
  }

  // Guard: size check only needed for binary path
  if (pdfBase64) {
    const sizeBytes = Buffer.byteLength(pdfBase64, 'base64');
    if (sizeBytes > 28 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File is too large to analyze (${(sizeBytes / 1048576).toFixed(1)} MB). Maximum ~28 MB. Try a text-based PDF.` },
        { status: 413 }
      );
    }
  }

  // Build the Claude message — text path is much faster and cheaper
  const userContent = textContent
    ? [
        {
          type: 'text',
          text: `Review this contract against ILC Studios standard positions. Return only the JSON. Flag every meaningful deviation, missing clause, and risk. Flag anything better than ILC standard as GREEN.\n\n---\n\n${textContent}`,
        },
      ]
    : [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        {
          type: 'text',
          text: 'Review this contract against ILC Studios standard positions. Return only the JSON. Flag every meaningful deviation, missing clause, and risk. Flag anything better than ILC standard as GREEN.',
        },
      ];

  let message;
  try {
    message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 16000,
      system:     CONTRACT_SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    const msg = err?.message || String(err);
    return NextResponse.json({ error: `Claude API error: ${msg}` }, { status: 502 });
  }

  // Extract and parse the JSON response
  const raw   = message.content.map(b => b.text || '').join('');
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');

  if (message.stop_reason === 'max_tokens' && (start === -1 || end === -1)) {
    return NextResponse.json(
      { error: 'Contract is too long for a single pass. Try uploading a specific exhibit or exhibit section.' },
      { status: 422 }
    );
  }

  const clean = (start !== -1 && end > start) ? raw.slice(start, end + 1) : raw.trim();

  let analysis;
  try {
    analysis = JSON.parse(clean);
  } catch {
    if (message.stop_reason === 'max_tokens') {
      return NextResponse.json(
        { error: 'Analysis was cut off — document too large. Upload a shorter PDF or specific exhibit.' },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: 'Claude returned malformed JSON', raw: raw.slice(0, 500) },
      { status: 500 }
    );
  }

  // Persist analysis so it survives page refresh
  if (savedFileId) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "ProjectFile" SET "analysisData" = ? WHERE "id" = ?`,
        JSON.stringify(analysis),
        savedFileId
      );
    } catch {}
  }

  return NextResponse.json({ analysis, fileName });
}
