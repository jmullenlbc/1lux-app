import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { putKnowledgeFile, safeStoredName } from '@/lib/botKnowledge/storage';
import { extractDocumentText } from '@/lib/botKnowledge/extract';
import { detectFileType } from '@/lib/botKnowledge/text';
import { runParkedJob, readJobRequest, uploadToJobArgs, loadJobUpload } from '@/lib/parkedJob';
import { MAX_KNOWLEDGE_UPLOAD_BYTES } from '@/lib/uploadStorage';

export const runtime     = 'nodejs';
export const maxDuration = 300; // OCR of a scanned page is slow; see extract.js

// 25 MB, the same ceiling as an email attachment. Mike, 2026-09-07: "we should
// make it up to 25mbs like email. can we do it in pieces very easily like
// drawings?"
//
// It can, and it has to. Amplify's front door rejects request bodies over
// roughly 4.4 MB with an empty 413, so a 25 MB file can never travel THROUGH
// this route, raising the number here alone would have made things worse, not
// better. The browser sends the file straight to storage in 5 MB pieces (the
// same plumbing the drawing sets use) and this route gets only a key, which is
// why the number below can be six times the front door's own limit.
//
// The limit still applies to files that DID arrive in the request body: small
// ones in production, and everything in local dev, which has no front door.
const MAX_BYTES = MAX_KNOWLEDGE_UPLOAD_BYTES;

// GET /api/automation/knowledge/docs?category=&q=&active=
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const q        = searchParams.get('q');
  const active   = searchParams.get('active');

  const where = { isActive: active === 'false' ? false : true };
  if (category) where.category = category;
  if (q) {
    where.OR = [
      { title:       { contains: q } },
      { description: { contains: q } },
      { fileName:    { contains: q } },
      { text:        { contains: q } },
    ];
  }

  const docs = await prisma.botKnowledgeDoc.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    // The extracted text of a 100-page PDF has no business travelling to a list
    // screen. charCount is there so the UI can still say how much was read.
    select: {
      id: true, category: true, title: true, description: true, fileName: true,
      fileType: true, mimeType: true, sizeBytes: true, charCount: true,
      pageCount: true, status: true, statusNote: true, isActive: true,
      createdAt: true, updatedAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ docs });
}

// POST /api/automation/knowledge/docs, one or many files.
//
// The bytes arrive one of two ways and this route stopped caring which:
//   direct, the browser sent the file straight to storage in 5 MB pieces
//               and the form carries only `uploadKeys`. This is how anything
//               over about 4 MB gets here in production.
//   classic, the file itself is in the form under `files`. Small uploads,
//               and everything in local dev, where there is no front door.
//
// Park-and-poll (src/lib/parkedJob.js). Reading a 25 MB scanned PDF is OCR
// page by page, minutes, well past Amplify's ~30-second front door. The
// first request only writes the job down (the file itself stays where it
// landed); the polls run the read and collect it. The page still sends one
// file per request, so a file that fails fails alone.
const KNOWLEDGE_INFLIGHT_MS = 300_000;

export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { body, formData } = await readJobRequest(request);
  let args = null;
  if (!body.jobKey) {
    if (!formData) {
      return NextResponse.json({ error: 'Upload could not be read. The file may be too large.' }, { status: 400 });
    }

    const uploads = [];

    // direct, the form carries only the keys; the bytes stay in storage until the read.
    const raw = formData.get('uploadKeys');
    if (raw) {
      let entries;
      try { entries = JSON.parse(String(raw)); } catch { entries = null; }
      if (!Array.isArray(entries)) {
        return NextResponse.json({ error: 'The upload references were unreadable. Please try again.' }, { status: 400 });
      }
      for (const entry of entries) {
        uploads.push({
          uploadKey: String(entry?.key ?? ''),
          fileName:  String(entry?.name || 'file'),
          fileType:  String(entry?.type || '') || 'application/octet-stream',
        });
      }
    }

    // classic, the file rode the form body; it is stashed under a key of its own
    // so the poll that runs the read can find it.
    for (const file of formData.getAll('files')) {
      if (!file || typeof file === 'string') continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > MAX_BYTES) {
        return NextResponse.json({ error: `${file.name} is larger than ${Math.round(MAX_BYTES / (1024 * 1024))} MB.` }, { status: 413 });
      }
      uploads.push(await uploadToJobArgs({ buffer, name: file.name, type: file.type, uploadKey: null }, { scope: 'knowledge' }));
    }

    if (!uploads.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 });

    args = {
      uploads,
      category:    (formData.get('category')    || 'GENERAL').toString().trim() || 'GENERAL',
      description: (formData.get('description') || '').toString().trim() || null,
    };
  }

  return runParkedJob({
    body, kind: 'knowledge.docs', scope: 'knowledge', args, inflightMs: KNOWLEDGE_INFLIGHT_MS,
    run: (a) => readDocuments(a, { user }),
  });
}

/** The read itself: store, extract, write the row, one entry at a time. */
async function readDocuments({ uploads = [], category = 'GENERAL', description = null }, { user }) {
  const created = [];
  const failed  = [];

  for (const entry of uploads) {
    const fileName = String(entry.fileName || 'file');
    const mimeType = String(entry.fileType || '') || 'application/octet-stream';

    // Check the type before storing anything, no point keeping a .zip nobody
    // can read.
    if (!detectFileType(fileName, mimeType)) {
      failed.push({ fileName, reason: 'Not a file type the bot can read. Word, Excel, PDF, images and text files work.' });
      continue;
    }

    let upload;
    try {
      upload = await loadJobUpload(entry, { limit: MAX_BYTES });
    } catch (e) {
      failed.push({ fileName, reason: e?.payload?.message || e?.message || 'The uploaded file could not be found. Please try uploading again.' });
      continue;
    }

    try {
      const buffer = upload.buffer;

      let storedPath;
      try {
        storedPath = await putKnowledgeFile(buffer, {
          stored:      safeStoredName(fileName),
          contentType: mimeType,
        });
      } catch (e) {
        failed.push({ fileName, reason: `Could not be saved: ${e.message}` });
        continue;
      }

      // The file is stored by this point. Whatever the reading turns up, the row
      // gets written, a FAILED row keeps the file findable and says why it could
      // not be read, which is far better than losing it.
      const result = await extractDocumentText(buffer, fileName, mimeType);

      const doc = await prisma.botKnowledgeDoc.create({
        data: {
          category,
          title:       fileName.replace(/\.[^.]+$/, ''),
          description,
          fileName,
          fileType:    result.fileType || 'text',
          mimeType,
          sizeBytes:   buffer.length,
          storedPath,
          text:        result.text || null,
          charCount:   (result.text || '').length,
          pageCount:   result.pageCount ?? null,
          status:      result.status,
          statusNote:  result.note || null,
          createdById: user.id,
        },
        select: {
          id: true, category: true, title: true, description: true, fileName: true,
          fileType: true, sizeBytes: true, charCount: true, pageCount: true,
          status: true, statusNote: true, isActive: true, createdAt: true,
        },
      });

      created.push(doc);
    } finally {
      // The temporary copy in the transfer area has been read and re-filed by now.
      // Best effort, a 1-day lifecycle rule sweeps anything this misses.
      await upload.cleanup().catch(() => {});
    }
  }

  return { created, failed };
}
