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

// What the PUBLIC intake drop zone accepts. Mike, 2026-08-21, after a GC's
// 246 MB set was refused on the live site: "Raise the cap to handle up to
// 400mb... We have to make it so it never fails unless it is absurdly big."
//
// A number this large is only safe because nothing ever holds the whole file:
// the browser streams it straight to S3, and the parser reads it back in byte
// ranges (see pdfRange.js). 400 MB covers a full DD/CD set with room to spare;
// past that we would rather say so plainly than time out.
export const MAX_INTAKE_UPLOAD_BYTES = 400 * 1024 * 1024; // 400 MB

/** @deprecated name kept for callers that predate the intake/project split. */
export const MAX_DIRECT_UPLOAD_BYTES = MAX_INTAKE_UPLOAD_BYTES;

// What the in-app project upload windows enforce. Mike, 2026-08-19: "we need
// that limit to go up to 25mb — schedules can be 50 pages long if detailed."
// Deliberately below the hard ceiling above: every megabyte here also becomes
// PDF text we parse and, on some tabs, tokens we pay for.
export const MAX_PROJECT_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

// The slip has to outlive the upload itself. A 400 MB set over a job-site
// connection at 2 Mbps takes ~27 minutes, and a slip that expires mid-transfer
// fails the upload at 90% with nothing the visitor can do about it. An hour is
// sized for the worst realistic case; it still expires on its own, and the key
// it grants is a fresh random one that reaches no existing object.
const PRESIGN_TTL_SECONDS = 3600;

// Only these types can be presigned. Keys are file extensions; values are the
// Content-Type the slip is locked to (S3 rejects a PUT whose Content-Type
// differs from the signed one).
const PRESIGNABLE = {
  pdf:  'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
};

// The only scopes a slip may be issued for. The key is always a random cuid
// under uploads/, so a scope cannot be used to reach an existing object — it
// only selects which ceiling applies and makes the temp keys readable.
const SCOPES = ['intake', 'project'];

const mb = (bytes) => Math.round(bytes / (1024 * 1024));

export function limitForScope(scope) {
  return scope === 'project' ? MAX_PROJECT_UPLOAD_BYTES : MAX_INTAKE_UPLOAD_BYTES;
}

export function presignAvailable() {
  return !!process.env.S3_BUCKET;
}

/**
 * Pure validation, exported so it can be unit-tested without AWS.
 * @returns { ok: true, ext, contentType } | { ok: false, code, message }
 */
export function validatePresignRequest({ fileName, size, scope = 'intake' } = {}) {
  if (!SCOPES.includes(scope)) {
    return { ok: false, code: 'bad_request', message: 'Unknown upload type.' };
  }
  const name = String(fileName ?? '').trim();
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (!PRESIGNABLE[ext]) {
    return { ok: false, code: 'unsupported_type', message: 'Unsupported file type. Please upload a PDF or Excel file.' };
  }
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, code: 'bad_request', message: 'Missing file size.' };
  }
  const ceiling = limitForScope(scope);
  if (bytes > ceiling) {
    return { ok: false, code: 'too_large', message: `That file is larger than ${mb(ceiling)} MB. Please upload a smaller file.` };
  }
  return { ok: true, ext, contentType: PRESIGNABLE[ext], scope, limit: ceiling };
}

/**
 * Issue a permission slip for one upload.
 * @returns { key, url, expiresIn } — key is where the object will live.
 */
export async function presignUpload({ scope = 'intake', ext, contentType }) {
  const safeScope = SCOPES.includes(scope) ? scope : 'intake';
  const key = `uploads/${safeScope}/${createId()}.${ext}`;
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
export async function getUploadedObject(key, { limit = MAX_INTAKE_UPLOAD_BYTES } = {}) {
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
    if ((head.ContentLength ?? 0) > limit) {
      return { ok: false, code: 'too_large', message: `That file is larger than ${mb(limit)} MB.` };
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


/**
 * Size and existence of an uploaded object, without fetching a byte of it.
 * This is what lets the parser decide HOW to read a file before it commits to
 * reading it — see pdfRange.js.
 * @returns { ok: true, size, contentType } | { ok: false, code, message }
 */
export async function headUploadedObject(key) {
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
    return { ok: true, size: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
  } catch (err) {
    console.error('[uploadStorage] headUploadedObject failed for key', key, err?.name ?? err?.message ?? err);
    return { ok: false, code: 'not_found', message: 'The uploaded file could not be found. Please try uploading again.' };
  }
}

/**
 * A function that fetches one byte range of an uploaded object.
 *
 * Handed to pdfjs so it can walk a 400 MB drawing set a slice at a time. `end`
 * is EXCLUSIVE here (JavaScript convention); S3's Range header is inclusive on
 * both ends, hence the -1.
 *
 * @returns {(begin:number, end:number) => Promise<Uint8Array>}
 */
export function rangeFetcherFor(key) {
  if (!isUploadKey(key)) throw new Error('rangeFetcherFor: not a valid upload key');
  return async (begin, end) => {
    const res = await s3Client().send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Range: `bytes=${begin}-${end - 1}`,
    }));
    return new Uint8Array(await res.Body.transformToByteArray());
  };
}


// ── Kept sheets ─────────────────────────────────────────────────────────────
//
// The four sheets we actually read out of a set, saved as images so ILC staff
// can look at what the parse was working from. Mike, 2026-08-21: "keep the
// small, compressed version for sure. So they can reference."
//
// These live under `sheets/`, NOT `uploads/`, and that separation is the whole
// point: `uploads/` is swept by a lifecycle rule a day after a file lands,
// because a 400 MB drawing set is not something to keep paying for. A kept
// sheet is a few hundred kilobytes and is meant to outlive the upload it came
// from, so it must not share a prefix with the things being deleted.

const SHEET_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/** How long a staff member's view link stays good. Short: it is re-issued on
 *  every page load, and a link that outlives the session is a link that can be
 *  forwarded to someone who should not have it. */
const SHEET_VIEW_TTL_SECONDS = 300;

/** True only for keys putSheetImage could have written. */
export function isSheetKey(key) {
  return typeof key === 'string'
    && /^sheets\/[a-z0-9]+\.(jpg|png)$/i.test(key)
    && !key.includes('..');
}

/**
 * Store one rendered sheet. Best-effort by design: a kept copy is a
 * convenience, and failing to save it must never fail a GC's upload.
 * @returns {Promise<string|null>} the key, or null if it could not be stored
 */
export async function putSheetImage(buffer, contentType = 'image/jpeg') {
  const ext = SHEET_TYPES[contentType];
  if (!ext || !buffer?.length || !presignAvailable()) return null;
  const key = `sheets/${createId()}.${ext}`;
  try {
    await s3Client().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return key;
  } catch (err) {
    console.error('[uploadStorage] putSheetImage failed', err?.message ?? err);
    return null;
  }
}

/**
 * A short-lived link to view a kept sheet.
 *
 * Read-only and expiring, so the caller decides who gets one — the only route
 * that issues these is admin-gated. Returns null rather than throwing, because
 * a sheet that has gone missing should leave a gap in the page, not a 500.
 */
export async function presignSheetRead(key) {
  if (!isSheetKey(key) || !presignAvailable()) return null;
  try {
    return await getSignedUrl(s3Client(), new GetObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key,
    }), { expiresIn: SHEET_VIEW_TTL_SECONDS });
  } catch (err) {
    console.error('[uploadStorage] presignSheetRead failed', err?.message ?? err);
    return null;
  }
}
