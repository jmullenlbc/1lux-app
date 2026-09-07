import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { putKnowledgeFile, safeStoredName } from '@/lib/botKnowledge/storage';
import { extractDocumentText } from '@/lib/botKnowledge/extract';
import { detectFileType } from '@/lib/botKnowledge/text';
import { readUploadedFiles } from '@/lib/uploadIntake';
import { MAX_KNOWLEDGE_UPLOAD_BYTES } from '@/lib/uploadStorage';

export const runtime     = 'nodejs';
export const maxDuration = 300; // OCR of a scanned page is slow; see extract.js

// 25 MB, the same ceiling as an email attachment. Mike, 2026-09-07: "we should
// make it up to 25mbs like email. can we do it in pieces very easily like
// drawings?"
//
// It can, and it has to. Amplify's front door rejects request bodies over
// roughly 4.4 MB with an empty 413, so a 25 MB file can never travel THROUGH
// this route — raising the number here alone would have made things worse, not
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

// POST /api/automation/knowledge/docs — one or many files.
//
// The bytes arrive one of two ways and this route stopped caring which:
//   direct    — the browser sent the file straight to storage in 5 MB pieces
//               and the form carries only `uploadKeys`. This is how anything
//               over about 4 MB gets here in production.
//   classic   — the file itself is in the form under `files`. Small uploads,
//               and everything in local dev, where there is no front door.
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Upload could not be read. The file may be too large.' }, { status: 400 });
  }

  const got = await readUploadedFiles(formData, { limit: MAX_BYTES });
  if (!got.ok) return NextResponse.json({ error: got.message }, { status: got.status });

  const category    = (formData.get('category')    || 'GENERAL').toString().trim() || 'GENERAL';
  const description = (formData.get('description') || '').toString().trim() || null;

  const created = [];
  const failed  = [];

  for (const file of got.files) {
    const fileName = file.name || 'file';

    // Check the type before storing anything — no point keeping a .zip nobody
    // can read.
    if (!detectFileType(fileName, file.type)) {
      failed.push({ fileName, reason: 'Not a file type the bot can read. Word, Excel, PDF, images and text files work.' });
      continue;
    }

    const buffer = file.buffer;

    let storedPath;
    try {
      storedPath = await putKnowledgeFile(buffer, {
        stored:      safeStoredName(fileName),
        contentType: file.type || 'application/octet-stream',
      });
    } catch (e) {
      failed.push({ fileName, reason: `Could not be saved: ${e.message}` });
      continue;
    }

    // The file is stored by this point. Whatever the reading turns up, the row
    // gets written — a FAILED row keeps the file findable and says why it could
    // not be read, which is far better than losing it.
    const result = await extractDocumentText(buffer, fileName, file.type);

    const doc = await prisma.botKnowledgeDoc.create({
      data: {
        category,
        title:       fileName.replace(/\.[^.]+$/, ''),
        description,
        fileName,
        fileType:    result.fileType || 'text',
        mimeType:    file.type || null,
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
  }

  // The temporary copy in the transfer area has been read and re-filed by now.
  // Best effort — a 1-day lifecycle rule sweeps anything this misses.
  await got.cleanup().catch(() => {});

  return NextResponse.json({ created, failed }, { status: created.length ? 201 : 400 });
}
