import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { getUploadedObject, deleteUploadedObject, isUploadKey } from '@/lib/uploadStorage';
import { putSalesDocObject, salesDocKey } from '@/lib/salesDocs/storage';
import { MAX_RECEIPT_BYTES, MIME_BY_EXT, sniffReceipt } from '@/lib/sales/receipts';

export const runtime = 'nodejs';

// GET  your receipts still waiting for an OK.
// POST a form with uploadKey or file, plus fileName and source (SNAP or DROP).
//      Stored at once; the read is a separate call so a failed read loses nothing.
export async function GET(request) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const receipts = await prisma.expenseReceipt.findMany({
    where: { userId: user.id, expenseId: null },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ receipts });
}

export async function POST(request) {
  const { user, error } = await requireStaff(request);
  if (error) return error;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'The receipt did not reach our server in one piece. Nothing was saved. Try again.' }, { status: 400 });
  }
  const uploadKey = form.get('uploadKey');
  const file = form.get('file');
  const fileName = String((uploadKey ? form.get('fileName') : file?.name) || 'receipt').slice(0, 255);
  const source = form.get('source') === 'SNAP' ? 'SNAP' : 'DROP';

  let buffer;
  if (uploadKey) {
    if (!isUploadKey(String(uploadKey))) {
      return NextResponse.json({ error: 'The upload could not be found. Nothing was saved. Try again.' }, { status: 400 });
    }
    const got = await getUploadedObject(String(uploadKey), { limit: MAX_RECEIPT_BYTES });
    if (!got.ok) {
      return NextResponse.json({ error: got.message || 'The upload could not be found. Nothing was saved. Try again.' }, { status: 400 });
    }
    buffer = got.buffer;
  } else if (file && typeof file.arrayBuffer === 'function') {
    if (file.size > MAX_RECEIPT_BYTES) {
      return NextResponse.json({ error: 'That file is over 25 MB. Nothing was saved. Use a smaller copy.' }, { status: 413 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
  } else {
    return NextResponse.json({ error: 'No file came through. Nothing was saved. Try again.' }, { status: 400 });
  }

  const ext = sniffReceipt(buffer);
  if (!ext) {
    return NextResponse.json({ error: 'That file did not open as a PDF, Excel, JPG or PNG. Nothing was saved.' }, { status: 400 });
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const same = await prisma.expenseReceipt.findFirst({
    where: { userId: user.id, sha256, archivedAt: null, OR: [{ expenseId: null }, { expense: { archivedAt: null } }] },
  });
  if (same) {
    if (uploadKey) await deleteUploadedObject(String(uploadKey)).catch(() => {});
    return NextResponse.json({ receipt: same, duplicate: true });
  }

  const mimeType = MIME_BY_EXT[ext];
  const storedKey = salesDocKey('receipts', randomUUID().replace(/-/g, ''), `receipt.${ext}`);
  await putSalesDocObject(storedKey, buffer, mimeType);
  const receipt = await prisma.expenseReceipt.create({
    data: { userId: user.id, fileName, mimeType, sizeBytes: buffer.length, storedKey, sha256, source },
  });
  if (uploadKey) await deleteUploadedObject(String(uploadKey)).catch(() => {});
  return NextResponse.json({ receipt }, { status: 201 });
}
