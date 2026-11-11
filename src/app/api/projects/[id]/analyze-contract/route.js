import '@/lib/pdfPolyfill';
import { loadPdfjs } from '@/lib/pdfjsNode';
import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, answerBudget } from '@/lib/aiModels';
import { buildUntrustedPrompt, ATTACHED_DOCUMENT_RULE } from '@/lib/agent/untrusted';
import { getProjectFileBuffer } from '@/lib/projectFileStorage';
import { CONTRACT_SYSTEM_PROMPT } from '@/lib/contractSystemPrompt';
import { readUploadedFile } from '@/lib/uploadIntake';
import { runParkedJob, readJobRequest, jobError, uploadToJobArgs, loadJobUpload } from '@/lib/parkedJob';

// Park-and-poll (src/lib/parkedJob.js). A contract review is the longest
// single model call in the app, 3 to 4 minutes on a large scanned PDF, so the
// first request only writes the job down and the polls run and collect it.
// The in-flight window is the Lambda's own ceiling: one run is trusted for
// the whole five minutes before a poll would start it again.
export const maxDuration = 300;
const CONTRACT_INFLIGHT_MS = 300_000;
const MAX_CONTRACT_BYTES   = 28 * 1024 * 1024;


// POST /api/projects/[id]/analyze-contract
// Body: { fileId }, ID of an already-uploaded ProjectFile (PDF)
// OR:   FormData with field "file", an uploaded PDF (for direct review without saving)
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { body, formData } = await readJobRequest(request);
  let args = null;
  if (!body.jobKey) {
    if (formData) {
      // Direct review without saving: the bytes are stashed under a key so the
      // polls can find them; the job args stay small.
      const up = await readUploadedFile(formData, { limit: MAX_CONTRACT_BYTES });
      if (!up.ok) return NextResponse.json({ error: up.message || 'No file provided' }, { status: up.status || 400 });
      args = await uploadToJobArgs(up, { scope: 'project' });
    } else {
      const fileId = body.fileId;
      if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });
      const file = await prisma.projectFile.findUnique({ where: { id: fileId }, select: { projectId: true } });
      if (!file || file.projectId !== params.id) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      args = { fileId };
    }
  }

  return runParkedJob({
    body, kind: 'contract.analyze', scope: params.id, args, inflightMs: CONTRACT_INFLIGHT_MS,
    run: (a) => reviewContract(a, { projectId: params.id, user }),
  });
}

/** The review itself. Returns the response body; throws jobError for the route's own failures. */
async function reviewContract(args, { projectId, user }) {
  // textContent = pre-extracted text from upload (fast path)
  // pdfBase64   = raw PDF binary (slow fallback for scanned/image PDFs)
  let textContent = null;
  let pdfBase64   = null;
  let fileName    = 'contract.pdf';
  let savedFileId = null;
  let cleanup     = null;

  if (args.fileId) {
    const file = await prisma.projectFile.findUnique({ where: { id: args.fileId } });
    if (!file || file.projectId !== projectId) throw jobError(404, { error: 'File not found' });

    fileName    = file.originalName;
    savedFileId = file.id;

    if (file.textContent && file.textContent.length > 100) {
      // Fast path: use pre-extracted text, no disk read, no base64, ~10× faster
      textContent = file.textContent;
    } else {
      // Slow path: scanned/image PDF, send binary to Claude vision
      const buffer = await getProjectFileBuffer(file.storedPath);
      if (!buffer) throw jobError(404, { error: 'File not found. It may have been deleted.' });
      pdfBase64 = buffer.toString('base64');
    }

  } else {
    // Direct upload, extract text on the fly, fall back to binary
    const up = await loadJobUpload(args, { limit: MAX_CONTRACT_BYTES });
    const buffer = up.buffer;
    fileName     = up.name;
    cleanup      = up.cleanup;

    // Try to extract text first
    try {
      const pdfjsLib = await loadPdfjs();
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

  try {
    return await reviewContent({ textContent, pdfBase64, fileName, savedFileId }, { projectId, user });
  } finally {
    // The stashed direct upload is only needed for this one read.
    if (cleanup) await cleanup().catch(() => {});
  }
}

async function reviewContent({ textContent, pdfBase64, fileName, savedFileId }, { projectId, user }) {
  // Guard: size check only needed for binary path
  if (pdfBase64) {
    const sizeBytes = Buffer.byteLength(pdfBase64, 'base64');
    if (sizeBytes > 28 * 1024 * 1024) {
      throw jobError(413, { error: `File is too large to analyze (${(sizeBytes / 1048576).toFixed(1)} MB). Maximum ~28 MB. Try a text-based PDF.` });
    }
  }

  const INSTRUCTIONS = 'Review this contract against 1LUX standard positions. Return only the JSON. Flag every meaningful deviation, missing clause, and risk. Flag anything better than ILC standard as GREEN.';

  // A contract is written by the other side. It is the single most likely
  // document in this app to contain language aimed at whoever reads it, and the
  // one where being talked into a softer reading costs the most. So the text
  // path goes through the injection boundary rather than being pasted after a
  // `---`. See src/lib/agent/untrusted.js.
  const sealed = textContent
    ? buildUntrustedPrompt({
        instructions: INSTRUCTIONS,
        system:       CONTRACT_SYSTEM_PROMPT,
        documents:    [{ text: textContent, descriptor: fileName, maxChars: 200000 }],
      })
    : null;

  if (sealed?.injection.found) {
    // Visibility only, the parse proceeds unchanged. Something in a contract
    // reading as an instruction to the reviewer is worth a human knowing about
    // whether or not it was aimed at a model.
    console.warn('[contract.analyze] third-party document contains instruction-like text',
      { projectId, input: sealed.seals[0].summary, markers: sealed.injection.markers.length });
  }

  // Build the Claude message, text path is much faster and cheaper
  const userContent = textContent
    ? [{ type: 'text', text: sealed.content }]
    : [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        {
          type: 'text',
          text: 'Review this contract against 1LUX standard positions. Return only the JSON. Flag every meaningful deviation, missing clause, and risk. Flag anything better than ILC standard as GREEN.',
        },
      ];

  let message;
  try {
    // Recorded per request rather than at the module-level client, so the run
    // carries the project and user it was for. wrapClient returns a Proxy, so
    // wrapping the shared client again per call is free.
    const recorded = wrapClient(new Anthropic({ apiKey: await getAnthropicKey() }), 'contract.analyze', { projectId: projectId, userId: user.id });
    message = await recorded.messages.create({
      ...modelParams('contract.analyze'),
      max_tokens: answerBudget('contract.analyze', 16000),
      // Text path: the boundary rule is already folded in, naming the fence ids.
      // PDF path: nothing to fence, so the attachment-shaped rule instead.
      system:     sealed ? sealed.system : `${CONTRACT_SYSTEM_PROMPT}\n\n${ATTACHED_DOCUMENT_RULE}`,
      messages:   [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    const msg = err?.message || String(err);
    throw jobError(502, { error: `Claude API error: ${msg}` });
  }

  // Extract and parse the JSON response
  const raw   = message.content.map(b => b.text || '').join('');
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');

  if (message.stop_reason === 'max_tokens' && (start === -1 || end === -1)) {
    throw jobError(422, { error: 'Contract is too long for a single pass. Try uploading a specific exhibit or exhibit section.' });
  }

  const clean = (start !== -1 && end > start) ? raw.slice(start, end + 1) : raw.trim();

  let analysis;
  try {
    analysis = JSON.parse(clean);
  } catch {
    if (message.stop_reason === 'max_tokens') {
      throw jobError(422, { error: 'Analysis was cut off, document too large. Upload a shorter PDF or specific exhibit.' });
    }
    throw jobError(500, { error: 'Claude returned malformed JSON', raw: raw.slice(0, 500) });
  }

  // Persist analysis so it survives page refresh
  if (savedFileId) {
    try {
      await prisma.projectFile.update({
        where: { id: savedFileId },
        data:  { analysisData: JSON.stringify(analysis) },
      });
    } catch (e) { console.error('[analyze-contract persist] failed:', e?.message ?? e); }
  }

  return { analysis, fileName };
}
