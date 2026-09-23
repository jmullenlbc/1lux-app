/**
 * Take a photograph of a decorative fixture and keep it.
 *
 * An ordinary form post, not the presign desk. A catalogue photo is a few
 * hundred kilobytes, and the presign dance exists for 300 MB drawing sets.
 * FIXTURE_IMAGE_MAX_BYTES keeps the body under Amplify's front door, which
 * answers anything bigger with an empty 413 and no message at all — the
 * check here is what turns that silence into a sentence.
 *
 * Returns the address the screen puts in an <img>, not a storage key. Nothing
 * outside uploadStorage.js has to know where the bytes actually live.
 */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { putFixtureImage, FIXTURE_IMAGE_MAX_BYTES } from '@/lib/uploadStorage';

export const dynamic = 'force-dynamic';

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request) {
  const { error } = await requirePermission(request, 'editProducts');
  if (error) return error;

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'That upload did not arrive in one piece. Try again.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Choose a picture to upload.' }, { status: 400 });
  }

  const contentType = String(file.type || '').toLowerCase();
  if (!ACCEPTED.has(contentType)) {
    return NextResponse.json(
      { error: 'That has to be a JPG, PNG or WEBP picture.' },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > FIXTURE_IMAGE_MAX_BYTES) {
    const mb = (FIXTURE_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
    return NextResponse.json(
      { error: `That picture is too big. Keep it under ${mb} MB — a catalogue photo is normally well under one.` },
      { status: 400 },
    );
  }
  if (!bytes.length) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }

  const key = await putFixtureImage(bytes, contentType);
  if (!key) {
    return NextResponse.json(
      { error: 'The picture could not be stored. Nothing was changed — try again.' },
      { status: 502 },
    );
  }

  // `fixtures/abc123.jpg` → `/api/decorative-images/abc123.jpg`
  return NextResponse.json({ imageUrl: `/api/decorative-images/${key.slice('fixtures/'.length)}` });
}
