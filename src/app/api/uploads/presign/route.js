import { NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { presignAvailable, validatePresignRequest, presignUpload } from '@/lib/uploadStorage';

export const dynamic = 'force-dynamic';

/**
 * PUBLIC permission-slip desk for direct-to-S3 uploads.
 *
 * The browser says "I want to upload drawing.pdf, 12 MB". We validate the type
 * and size, then hand back a presigned PUT URL — good for one object, one
 * content type, one hour. The file itself never touches this server, which is
 * the whole point: Amplify's front door caps request bodies at ~4.4 MB, and a
 * full drawing set is 200–350 MB.
 *
 * `scope` selects which ceiling applies ('intake' 400 MB, 'project' 25 MB) and
 * nothing else — the key is a fresh random cuid under uploads/ either way, so
 * a scope can never be used to reach an object that already exists.
 *
 * Unauthenticated on purpose — the public conceptual-budget intake is the
 * first consumer. What keeps it safe:
 *   - the slip is scoped to one generated key under uploads/, expires in
 *     10 minutes, and is locked to a validated content type and our own
 *     bucket — it grants no read, list, or delete anywhere
 *   - per-IP rate limit (same speed-bump caveats as the other intake routes)
 *   - the parse routes re-check the object's ACTUAL size before reading it,
 *     and a 1-day lifecycle rule on uploads/ sweeps abandoned objects
 *
 * When S3 isn't configured (local dev), reports { available: false } and the
 * caller falls back to the classic multipart upload — dev has no front-door
 * cap, so nothing is lost.
 */

const LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request) {
  const ip = clientIp(request);
  const { allowed, retryAfterSec } = rateLimit(`uploads-presign:${ip}`, LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many uploads. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    );
  }

  if (!presignAvailable()) {
    return NextResponse.json({ available: false });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid request.' }, { status: 400 });
  }

  const check = validatePresignRequest({ fileName: body?.fileName, size: body?.size, scope: body?.scope });
  if (!check.ok) {
    return NextResponse.json({ error: check.code, message: check.message }, { status: check.code === 'too_large' ? 413 : 422 });
  }

  try {
    const slip = await presignUpload({ scope: check.scope, ext: check.ext, contentType: check.contentType });
    return NextResponse.json({ available: true, ...slip, contentType: check.contentType });
  } catch (err) {
    console.error('uploads/presign failed:', err?.message ?? err);
    return NextResponse.json({ error: 'presign_failed', message: 'Could not prepare the upload. Please try again.' }, { status: 502 });
  }
}
