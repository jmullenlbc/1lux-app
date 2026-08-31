import { NextResponse } from 'next/server';
import { stampError } from '@/lib/intake/errorNumbers';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { presignAvailable, completeMultipart, abortMultipart } from '@/lib/uploadStorage';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC closing desk for chunked uploads.
 *
 * The browser sends a big file to storage in parts (see PART_BYTES in
 * uploadStorage.js). Storage holds those parts separately until someone says
 * "that's all of them" — this route says it, and storage stitches them into
 * one object at the key the presign desk issued.
 *
 * Why the server does the stitching rather than the browser: reassembly needs
 * each part's ETag, and a browser can only read a cross-origin response header
 * if the bucket's CORS policy exposes it — a console setting we don't own. So
 * the server asks storage what actually landed instead. It also means a
 * browser can't talk us into assembling parts it didn't send.
 *
 * `action: 'abort'` throws away an upload the browser gave up on, so half a
 * drawing set doesn't sit in the bucket waiting on the lifecycle sweep.
 *
 * Unauthenticated for the same reason as the presign desk — the public
 * conceptual-budget intake is the first consumer. What keeps it safe: the key
 * must match the uploads/ shape our own presign desk issues, the uploadId must
 * match a live upload against that exact key, and nothing here reads, lists,
 * or reaches any object outside the one being assembled.
 */

const LIMIT = { limit: 30, windowMs: 60_000 };

export async function POST(request) {
  const ip = clientIp(request);
  const { allowed, retryAfterSec } = rateLimit(`uploads-complete:${ip}`, LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many uploads. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    );
  }

  if (!presignAvailable()) {
    return NextResponse.json({ error: 'unavailable', message: stampError('unavailable', 'Direct uploads are not configured.') }, { status: 409 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: stampError('bad_request', 'Invalid request.') }, { status: 400 });
  }

  const key      = String(body?.key ?? '');
  const uploadId = String(body?.uploadId ?? '');
  if (!key || !uploadId) {
    return NextResponse.json({ error: 'bad_request', message: stampError('bad_request', 'Missing upload reference.') }, { status: 400 });
  }

  if (body?.action === 'abort') {
    await abortMultipart({ key, uploadId });
    return NextResponse.json({ aborted: true });
  }

  try {
    const expectedParts = Number(body?.parts);
    const res = await completeMultipart({
      key, uploadId,
      expectedParts: Number.isFinite(expectedParts) ? expectedParts : undefined,
    });
    if (!res.ok) {
      // A part is missing — the object would be silently truncated if we
      // assembled it, so throw the whole thing away and say so.
      await abortMultipart({ key, uploadId });
      return NextResponse.json({ error: res.code, message: stampError(res.code, res.message) }, { status: 422 });
    }
    return NextResponse.json({ ok: true, key: res.key });
  } catch (err) {
    console.error('uploads/complete failed:', err?.message ?? err);
    await abortMultipart({ key, uploadId });
    return NextResponse.json(
      { error: 'complete_failed', message: 'The upload could not be finished. Please try again.' },
      { status: 502 },
    );
  }
}
