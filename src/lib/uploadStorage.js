// Direct-to-S3 uploads — the server side of the "permission slip" flow.
//
// Amplify's front door rejects request bodies over ~4.4 MB before our code
// runs (measured on prod 2026-08-15), so large files can never travel THROUGH
// the app. Instead the browser asks us for a presigned PUT URL (a one-time,
// expiring permission slip scoped to one key under uploads/), sends the file
// straight to S3, then tells the route the key. The route reads the bytes back
// from S3 and — on stateless routes like the public intake parse — deletes the
// object when it's done.
//
// In local dev there is no S3 bucket and no front-door cap, so presigning is
// simply reported as unavailable and callers keep using the direct multipart
// path they always had. Nothing about local testing changes.
//
// Build plan: G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\
// 2026.08.15 Direct-to-S3 Uploads — Build Plan.md

import { createId } from '@paralleldrive/cuid2';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from './qcStorage.js';

// One ceiling for every direct-to-S3 spot. Big enough for any drawing set
// we've seen; small enough to keep parse cost and abuse surface sane.
export const MAX_DIRECT_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const PRESIGN_TTL_SECONDS = 600; // the slip expires on its own in 10 minutes

// Only these types can be presigned. Keys are file extensions; values are the
// Content-Type the slip is locked to (S3 rejects a PUT whose Content-Type
// differs from the signed one).
const PRESIGNABLE = {
  pdf:  'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
};

export function presignAvailable() {
  return !!process.env.S3_BUCKET;
}

/**
 * Pure validation, exported so it can be unit-tested without AWS.
 * @returns { ok: true, ext, contentType } | { ok: false, code, message }
 */
export function validatePresignRequest({ fileName, size } = {}) {
  const name = String(fileName ?? '').trim();
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (!PRESIGNABLE[ext]) {
    return { ok: false, code: 'unsupported_type', message: 'Unsupported file type. Please upload a PDF or Excel file.' };
  }
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, code: 'bad_request', message: 'Missing file size.' };
  }
  if (bytes > MAX_DIRECT_UPLOAD_BYTES) {
    return { ok: false, code: 'too_large', message: 'That file is larger than 50 MB. Please upload a smaller file.' };
  }
  return { ok: true, ext, contentType: PRESIGNABLE[ext] };
}

/**
 * Issue a permission slip for one upload.
 * @returns { key, url, expiresIn } — key is where the object will live.
 */
export async function presignUpload({ scope = 'intake', ext, contentType }) {
  const key = `uploads/${scope}/${createId()}.${ext}`;
  const url = await getSignedUrl(s3Client(), new PutObjectCommand({
    Bucket:      process.env.S3_BUCKET,
    Key:         key,
    ContentType: contentType,
  }), { expiresIn: PRESIGN_TTL_SECONDS });
  return { key, url, expiresIn: PRESIGN_TTL_SECONDS };
}

/** True only for keys our presign route could have issued. */
export function isUploadKey(key) {
  return typeof key === 'string'
    && /^uploads\/[a-z0-9-]+\/[a-z0-9]+\.[a-z0-9]+$/i.test(key)
    && !key.includes('..');
}

/**
 * Fetch an uploaded object's bytes. Refuses keys outside uploads/ and objects
 * over the size ceiling — the slip constrains the declared size, but the
 * object's ACTUAL size is what we re-check here.
 * @returns { ok: true, buffer } | { ok: false, code, message }
 */
export async function getUploadedObject(key) {
  if (!isUploadKey(key)) {
    return { ok: false, code: 'bad_key', message: 'Not a valid upload reference.' };
  }
  if (!presignAvailable()) {
    return { ok: false, code: 'unavailable', message: 'Direct uploads are not configured.' };
  }
  try {
    const head = await s3Client().send(new HeadObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key,
    }));
    if ((head.ContentLength ?? 0) > MAX_DIRECT_UPLOAD_BYTES) {
      return { ok: false, code: 'too_large', message: 'That file is larger than 50 MB.' };
    }
    const res = await s3Client().send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key,
    }));
    const buffer = Buffer.from(await res.Body.transformToByteArray());
    return { ok: true, buffer };
  } catch (err) {
    // NoSuchKey = expired slip never used, or lifecycle already swept it.
    console.error('[uploadStorage] getUploadedObject failed for key', key, err?.name ?? err?.message ?? err);
    return { ok: false, code: 'not_found', message: 'The uploaded file could not be found. Please try uploading again.' };
  }
}

/**
 * Best-effort delete after a stateless route is done with the bytes. Never
 * throws — the 1-day lifecycle rule on uploads/ is the backstop for anything
 * this misses.
 */
export async function deleteUploadedObject(key) {
  if (!isUploadKey(key) || !presignAvailable()) return false;
  try {
    await s3Client().send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key,
    }));
    return true;
  } catch (err) {
    console.error('[uploadStorage] deleteUploadedObject failed for key', key, err?.message ?? err);
    return false;
  }
}
