import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { abortMultipart, completeMultipart, presignAvailable } from '@/lib/uploadStorage';

export const dynamic = 'force-dynamic';

/** Finishes or cancels a file sent in parts. Own route so the public 30 a minute limit cannot stop a 500 file run. */
export async function POST(request) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;
  if (!presignAvailable()) return NextResponse.json({ message: 'Direct upload is not set up here. (JOB_LOADER_NO_STORAGE)' }, { status: 503 });

  const body = await request.json().catch(() => null);
  const key = String(body?.key ?? '');
  const uploadId = String(body?.uploadId ?? '');
  if (!key || !uploadId) return NextResponse.json({ message: 'That upload had no key. (JOB_LOADER_NO_KEY)' }, { status: 400 });

  if (body?.action === 'abort') {
    await abortMultipart({ key, uploadId });
    return NextResponse.json({ aborted: true });
  }
  const expectedParts = Number(body?.parts);
  const res = await completeMultipart({ key, uploadId, expectedParts: Number.isFinite(expectedParts) ? expectedParts : undefined });
  if (!res.ok) {
    await abortMultipart({ key, uploadId });
    return NextResponse.json({ error: res.code, message: res.message }, { status: 400 });
  }
  return NextResponse.json(res);
}
