// Direct-to-S3 uploads, the server side of the "permission slip" flow.
//
// Amplify's front door rejects request bodies over ~4.4 MB before our code
// runs (measured on prod 2026-08-15), so large files can never travel THROUGH
// the app. Instead the browser asks us for a presigned PUT URL (a one-time,
// expiring permission slip scoped to one key under uploads/), sends the file
// straight to S3, then tells the route the key. The route reads the bytes back
// from S3 and, on stateless routes like the public intake parse, deletes the
// object when it's done.
//
// In local dev there is no S3 bucket and no front-door cap, so presigning is
// simply reported as unavailable and callers keep using the direct multipart
// path they always had. Nothing about local testing changes.
//
// Build plan: G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\
// 2026.08.15 Direct-to-S3 Uploads, Build Plan.md

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip as gzipCb, gunzip as gunzipCb } from 'node:zlib';
import { createId } from '@paralleldrive/cuid2';
import {
  PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand, ListPartsCommand,
} from '@aws-sdk/client-s3';
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
// that limit to go up to 25mb, schedules can be 50 pages long if detailed."
// Deliberately below the hard ceiling above: every megabyte here also becomes
// PDF text we parse and, on some tabs, tokens we pay for.
export const MAX_PROJECT_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

// What the Bot Knowledge drop zone enforces. Mike, 2026-09-07: "we should make
// it up to 25mbs like email." Same number as the project windows, and for the
// same reason, every megabyte here becomes text we store and search.
export const MAX_KNOWLEDGE_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

// Sales Docs (0137): price sheets, spec books and decks shared by link.
export const MAX_SALESDOC_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

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

// The bot's library takes everything the reader can open, not just drawings and
// schedules, Word documents, images and plain text as well. Kept separate from
// the list above so widening it here cannot widen what the public intake page
// accepts.
const KNOWLEDGE_PRESIGNABLE = {
  ...PRESIGNABLE,
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf:  'application/rtf',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  csv:  'text/csv',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  bmp:  'image/bmp',
  txt:  'text/plain',
  md:   'text/markdown',
};

// Sales Docs share only what the viewer can show: PDF and modern Excel.
const SALESDOC_PRESIGNABLE = {
  pdf:  PRESIGNABLE.pdf,
  xlsx: PRESIGNABLE.xlsx,
};

// The only scopes a slip may be issued for. The key is always a random cuid
// under uploads/, so a scope cannot be used to reach an existing object, it
// only selects which ceiling and which type list apply, and makes the temp keys
// readable.
const SCOPES = ['intake', 'project', 'knowledge', 'salesdoc'];

const mb = (bytes) => Math.round(bytes / (1024 * 1024));

export function limitForScope(scope) {
  if (scope === 'project')   return MAX_PROJECT_UPLOAD_BYTES;
  if (scope === 'knowledge') return MAX_KNOWLEDGE_UPLOAD_BYTES;
  if (scope === 'salesdoc')  return MAX_SALESDOC_UPLOAD_BYTES;
  return MAX_INTAKE_UPLOAD_BYTES;
}

/** Which extensions a scope may presign, and the Content-Type each is locked to. */
export function typesForScope(scope) {
  if (scope === 'knowledge') return KNOWLEDGE_PRESIGNABLE;
  if (scope === 'salesdoc') return SALESDOC_PRESIGNABLE;
  return PRESIGNABLE;
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
    return { ok: false, code: 'bad_request', message: 'Your browser and our server got out of step, so nothing was read. Refresh the page and upload the file again.' };
  }
  const name = String(fileName ?? '').trim();
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const types = typesForScope(scope);
  if (!types[ext]) {
    return {
      ok: false,
      code: 'unsupported_type',
      message: scope === 'knowledge'
        ? 'Unsupported file type. Word, Excel, PDF, images and text files work.'
        : scope === 'salesdoc'
          ? 'Unsupported file type. Please upload a PDF or an .xlsx workbook.'
          : 'Unsupported file type. Please upload a PDF or Excel file.',
    };
  }
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, code: 'bad_request', message: 'Your browser and our server got out of step, so nothing was read. Refresh the page and upload the file again.' };
  }
  const ceiling = limitForScope(scope);
  if (bytes > ceiling) {
    return { ok: false, code: 'too_large', message: `That file is larger than ${mb(ceiling)} MB, so it was not saved. Save a smaller copy or split it, then upload again.` };
  }
  return { ok: true, ext, contentType: types[ext], scope, limit: ceiling };
}

/**
 * Issue a permission slip for one upload.
 * @returns { key, url, expiresIn }, key is where the object will live.
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

// ── Chunked uploads ─────────────────────────────────────────────────────────
//
// One long PUT is the wrong shape for a phone. Mike's upload died about 10%
// into a set on wifi (2026-08-29): the transfer started fine and the
// connection dropped partway, which kills the whole file because a single PUT
// has no smaller unit to fall back to. Anything can cause that drop, a wifi
// access-point handoff walking across an office, a carrier NAT timing out an
// idle-looking connection, a router with an itchy trigger on long uploads
// and none of it is worth diagnosing, because the fix is the same either way:
// stop betting the whole file on one connection.
//
// So a large file goes up in parts. Each part is its own short request with
// its own retry, so a drop costs one part instead of everything sent so far.
//
// Two deliberate choices:
//   - ALL the part slips are minted in one response. The alternative (ask for
//     each slip as we reach it) adds a round trip per part through a front
//     door that hangs up at 30 seconds, exactly the fragility we're removing.
//   - The browser never reads the parts' ETags back. S3 needs them to reassemble
//     the file, but a browser can only see a cross-origin response header if the
//     bucket's CORS policy exposes it, and that is a console setting we don't
//     control from here. Instead the server asks S3 what the parts were
//     (ListParts) when it stitches them together. No bucket change required.

// Storage's own floor for a non-final part is 5 MiB, and we sit exactly on it.
// Smaller parts are strictly better for the failure we're chasing: Mike's
// 12 MB file died about 1.2 MB in, so the smaller the unit of work, the more
// likely a retry clears it and the sooner we learn where the trouble is. The
// only cost is part count, a 400 MB set becomes 80 parts, nowhere near the
// 10,000 storage allows, and 80 links is a ~40 KB response minted once.
export const PART_BYTES = 5 * 1024 * 1024;

// Below this a single PUT is simply better: one request, no assembly step.
export const MULTIPART_MIN_BYTES = PART_BYTES;

export function partCountFor(bytes) {
  return Math.max(1, Math.ceil(Number(bytes) / PART_BYTES));
}

/**
 * Begin a chunked upload and mint a slip for every part up front.
 * @returns { key, uploadId, partUrls, partBytes, expiresIn }
 */
export async function presignMultipart({ scope = 'intake', ext, contentType, size }) {
  const safeScope = SCOPES.includes(scope) ? scope : 'intake';
  const key = `uploads/${safeScope}/${createId()}.${ext}`;
  const client = s3Client();

  const { UploadId } = await client.send(new CreateMultipartUploadCommand({
    Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType,
  }));

  const parts = partCountFor(size);
  const partUrls = await Promise.all(
    Array.from({ length: parts }, (_, i) => getSignedUrl(client, new UploadPartCommand({
      Bucket: process.env.S3_BUCKET, Key: key, UploadId, PartNumber: i + 1,
    }), { expiresIn: PRESIGN_TTL_SECONDS })),
  );

  return { key, uploadId: UploadId, partUrls, partBytes: PART_BYTES, expiresIn: PRESIGN_TTL_SECONDS };
}

/**
 * Stitch the uploaded parts into one object. Asks S3 which parts landed rather
 * than trusting the browser to report them, so a missing part fails here
 * loudly and before anything tries to read a half-written file.
 * @returns { ok: true, key } | { ok: false, code, message }
 */
export async function completeMultipart({ key, uploadId, expectedParts }) {
  if (!isUploadKey(key)) return { ok: false, code: 'bad_key', message: 'We lost track of this upload, so nothing was read. Please upload the file again.' };
  const client = s3Client();

  const listed = await client.send(new ListPartsCommand({
    Bucket: process.env.S3_BUCKET, Key: key, UploadId: uploadId,
  }));
  const parts = (listed.Parts ?? [])
    .map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag }))
    .sort((a, b) => a.PartNumber - b.PartNumber);

  if (!parts.length) {
    return { ok: false, code: 'no_parts', message: 'The upload did not finish. Please try again.' };
  }
  if (Number.isFinite(expectedParts) && parts.length !== expectedParts) {
    return {
      ok: false, code: 'missing_parts',
      message: 'Some of the file did not arrive. Please try uploading it again.',
    };
  }

  await client.send(new CompleteMultipartUploadCommand({
    Bucket: process.env.S3_BUCKET, Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }));
  return { ok: true, key };
}

/** Throw away a chunked upload the browser gave up on. Best effort. */
export async function abortMultipart({ key, uploadId }) {
  if (!isUploadKey(key)) return false;
  try {
    await s3Client().send(new AbortMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET, Key: key, UploadId: uploadId,
    }));
    return true;
  } catch {
    return false; // the bucket's lifecycle rule sweeps stragglers anyway
  }
}


/** True only for keys our presign route could have issued. */
export function isUploadKey(key) {
  return typeof key === 'string'
    && /^uploads\/[a-z0-9-]+\/[a-z0-9]+\.[a-z0-9]+$/i.test(key)
    && !key.includes('..');
}

/**
 * Fetch an uploaded object's bytes. Refuses keys outside uploads/ and objects
 * over the size ceiling, the slip constrains the declared size, but the
 * object's ACTUAL size is what we re-check here.
 * @returns { ok: true, buffer } | { ok: false, code, message }
 */
export async function getUploadedObject(key, { limit = MAX_INTAKE_UPLOAD_BYTES } = {}) {
  if (!isUploadKey(key)) {
    return { ok: false, code: 'bad_key', message: 'We lost track of this upload, so nothing was read. Please upload the file again.' };
  }
  if (!presignAvailable()) {
    if (!devStoreOn()) {
      return { ok: false, code: 'unavailable', message: 'Uploads are switched off right now. This is on our side, not your file. Please try again later, or email the file to precon@ilcstudios.com.' };
    }
    try {
      return { ok: true, buffer: await devGet(key) };
    } catch {
      return { ok: false, code: 'not_found', message: 'The uploaded file could not be found. Please try uploading again.' };
    }
  }
  try {
    const head = await s3Client().send(new HeadObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key,
    }));
    if ((head.ContentLength ?? 0) > limit) {
      return { ok: false, code: 'too_large', message: `That file is larger than ${mb(limit)} MB, so it was not saved. Save a smaller copy or split it, then upload again.` };
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
 * throws, the 1-day lifecycle rule on uploads/ is the backstop for anything
 * this misses.
 */
export async function deleteUploadedObject(key) {
  if (!isUploadKey(key)) return false;
  if (!presignAvailable()) return devStoreOn() ? devDel(key) : false;
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
 * reading it, see pdfRange.js.
 * @returns { ok: true, size, contentType } | { ok: false, code, message }
 */
export async function headUploadedObject(key) {
  if (!isUploadKey(key)) {
    return { ok: false, code: 'bad_key', message: 'We lost track of this upload, so nothing was read. Please upload the file again.' };
  }
  if (!presignAvailable()) {
    if (!devStoreOn()) {
      return { ok: false, code: 'unavailable', message: 'Uploads are switched off right now. This is on our side, not your file. Please try again later, or email the file to precon@ilcstudios.com.' };
    }
    try {
      return { ok: true, size: (await fs.stat(devPath(key))).size, contentType: null };
    } catch {
      return { ok: false, code: 'not_found', message: 'The uploaded file could not be found. Please try uploading again.' };
    }
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
  // Reading ranges off local disk is not an optimisation, it is the only way
  // the ranged path gets exercised before it reaches production. The staged
  // read exists BECAUSE a production-only code path went unnoticed for weeks.
  if (!presignAvailable()) {
    return async (begin, end) => {
      const fh = await fs.open(devPath(key), 'r');
      try {
        const buf = Buffer.alloc(end - begin);
        const { bytesRead } = await fh.read(buf, 0, buf.length, begin);
        return new Uint8Array(buf.subarray(0, bytesRead));
      } finally {
        await fh.close();
      }
    };
  }
  return async (begin, end) => {
    const res = await s3Client().send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Range: `bytes=${begin}-${end - 1}`,
    }));
    return new Uint8Array(await res.Body.transformToByteArray());
  };
}


// ── Fixture photographs ─────────────────────────────────────────────────────
//
// The picture of a decorative fixture that somebody looks at while they choose
// it. Same reasoning as kept sheets: these live under `fixtures/`, NOT
// `uploads/`, because `uploads/` is swept a day after a file lands and a
// fixture photo has to still be there next year when somebody asks what was on
// the screen when the client picked it.
//
// They are small, a catalogue photo, not a drawing, so they come in through
// the ordinary form post rather than the presign desk. FIXTURE_IMAGE_MAX_BYTES
// keeps that under Amplify's front door, which answers a bigger body with an
// empty 413 and no message at all.

const FIXTURE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Comfortably under Amplify's ~4.4 MB request ceiling. */
export const FIXTURE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** True only for keys putFixtureImage could have written. */
export function isFixtureKey(key) {
  return typeof key === 'string'
    && /^fixtures\/[a-z0-9]+\.(jpg|png|webp)$/i.test(key)
    && !key.includes('..');
}

/**
 * Store one fixture photograph.
 * @returns {Promise<string|null>} the key, or null if it could not be stored
 */
export async function putFixtureImage(buffer, contentType = 'image/jpeg') {
  const ext = FIXTURE_TYPES[contentType];
  if (!ext || !buffer?.length || (!presignAvailable() && !devStoreOn())) return null;
  const key = `fixtures/${createId()}.${ext}`;
  if (!presignAvailable()) return devPut(key, buffer).then(() => key).catch(() => null);
  try {
    await s3Client().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return key;
  } catch (err) {
    console.error('[uploadStorage] putFixtureImage failed', err?.message ?? err);
    return null;
  }
}

/** Read one back. null means gone, the screen shows a gap, not a 500. */
export async function getFixtureImage(key) {
  if (!isFixtureKey(key)) return null;
  if (!presignAvailable()) {
    if (!devStoreOn()) return null;
    return devGet(key).catch(() => null);
  }
  try {
    const res = await s3Client().send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key,
    }));
    return Buffer.from(await res.Body.transformToByteArray());
  } catch (err) {
    console.error('[uploadStorage] getFixtureImage failed for key', key, err?.name ?? err?.message ?? err);
    return null;
  }
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
  if (!ext || !buffer?.length || (!presignAvailable() && !devStoreOn())) return null;
  const key = `sheets/${createId()}.${ext}`;
  if (!presignAvailable()) return devPut(key, buffer).catch(() => null);
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

// ── The dev disk store ────────────────────────────────────────────────────────
// There is no S3 bucket in local dev, which used to be harmless: the multipart
// path handed the route a buffer and the route answered in one go.
//
// Staging broke that. The stages are separate HTTP requests, so the file and
// the scan have to outlive a request, and with no bucket there was nowhere for
// them to live, which would have meant the staged path could ONLY be
// exercised in production, on the public GC-facing page. That is exactly the
// arrangement that let the 30-second timeout reach a live site unnoticed.
//
// So in dev the same three operations fall back to a folder, the way the agent
// ledger already falls back to JSONL. Production never touches this: it is
// gated on NODE_ENV, and if S3 is configured S3 wins regardless.
const DEV_DIR = path.join(process.cwd(), '.intake-dev');
const devStoreOn = () => !presignAvailable() && process.env.NODE_ENV !== 'production';

/** Flatten a key to one safe filename. Never lets a key escape DEV_DIR. */
const devPath = (key) => path.join(DEV_DIR, key.replace(/[^a-z0-9._-]/gi, '_'));

async function devPut(key, body) {
  await fs.mkdir(DEV_DIR, { recursive: true });
  await fs.writeFile(devPath(key), body);
  return key;
}
const devGet = (key) => fs.readFile(devPath(key));
const devDel = (key) => fs.unlink(devPath(key)).then(() => true, () => false);

/**
 * Dev only: park uploaded bytes where a later stage can find them.
 * In production the browser has already PUT them to S3 and this is never called.
 */
export async function putUploadedObjectDev(buffer, ext) {
  if (!devStoreOn() || !buffer?.length) return null;
  const key = `uploads/intake/${createId()}.${String(ext || 'pdf').toLowerCase()}`;
  try {
    return await devPut(key, buffer);
  } catch (err) {
    console.error('[uploadStorage] putUploadedObjectDev failed', err?.message ?? err);
    return null;
  }
}

/**
 * Keep bytes that arrived IN the request so a parked job can read them later.
 *
 * A small file still rides the form body (see appendUpload in uploadClient.js);
 * the park-and-poll wrapper needs it to live somewhere a later request can
 * reach, because the job's args must stay small and JSON. Same prefix and
 * same one-day sweep as a direct upload, so nothing new to clean up.
 *
 * @returns {Promise<string|null>} an upload key, or null when there is no store
 */
export async function stashUploadedObject(buffer, ext, scope = 'project') {
  if (!buffer?.length || (!presignAvailable() && !devStoreOn())) return null;
  const safeScope = String(scope || 'project').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'project';
  const safeExt   = String(ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const key = `uploads/${safeScope}/${createId()}.${safeExt}`;
  try {
    if (!presignAvailable()) return await devPut(key, buffer);
    await s3Client().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key, Body: buffer,
      ContentType: 'application/octet-stream',
    }));
    return key;
  } catch (err) {
    console.error('[uploadStorage] stashUploadedObject failed', err?.message ?? err);
    return null;
  }
}

/** True only for keys putScanState could have issued. */
export function isScanKey(key) {
  return typeof key === 'string'
    && /^scans\/[a-z0-9]+\.json\.gz$/i.test(key)
    && !key.includes('..');
}

const gzip   = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

// A scan of a 120-sheet set is ~2.7 MB of JSON, the text layer of every page,
// which the unit-matrix read needs in full. Two things follow from that number:
// it cannot travel back through the browser (Amplify's front door rejects
// bodies over ~4.4 MB, and a GC on a job-site connection should not be made to
// re-upload it), and it should not travel uncompressed either. It gzips to
// ~490 KB, a 5x saving on every read, for a few milliseconds of CPU.
const MAX_SCAN_BYTES = 25 * 1024 * 1024;   // compressed; ~10x that in raw JSON

/**
 * Park the result of a scan so the later stages can pick it up.
 *
 * This exists because the read had to be broken into stages: Amplify hangs up
 * on any request over ~30 seconds, and a real set takes ~66. Each stage is now
 * its own request, so the work between them has to live somewhere, and it is
 * far too big to hand back to the browser.
 *
 * Same lifetime and same disposability as the upload it came from, it holds
 * text lifted off an anonymous submission, so it is swept by the same rule and
 * deleted explicitly once the last stage is done.
 *
 * @returns {Promise<string|null>} the scan key, or null if it could not be kept
 */
export async function putScanState(state) {
  return writeScan(`scans/${createId()}.json.gz`, state);
}

/**
 * Update a parked scan, keeping the key the caller already handed out.
 *
 * The render stage learns something the scan stage could not know, where the
 * drawn sheets ended up, and the site stage needs it. Minting a second key
 * would mean the browser is holding a stale one, so this writes over the same
 * object instead.
 */
export async function putScanStateAt(key, state) {
  if (!isScanKey(key)) return null;
  return writeScan(key, state);
}

/** The actual write, shared by both doors above. */
async function writeScan(key, state) {
  if (!state || (!presignAvailable() && !devStoreOn())) return null;
  try {
    const body = await gzip(Buffer.from(JSON.stringify(state), 'utf8'));
    if (body.length > MAX_SCAN_BYTES) {
      console.error('[uploadStorage] scan state too large to keep', body.length);
      return null;
    }
    if (!presignAvailable()) return await devPut(key, body);
    await s3Client().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/gzip',
    }));
    return key;
  } catch (err) {
    console.error('[uploadStorage] putScanState failed', err?.message ?? err);
    return null;
  }
}

/**
 * Read a parked scan back.
 *
 * Unlike the sheet helpers this one reports WHY it failed, because the caller
 * has to tell a waiting visitor something true: a scan that has expired needs
 * "start again", and a scan that never existed needs the same, but a storage
 * fault needs "try in a minute".
 *
 * @returns {{ok: true, state} | {ok: false, code, message}}
 */
export async function getScanState(key, { quiet = false } = {}) {
  if (!isScanKey(key)) {
    return { ok: false, code: 'bad_key', message: 'We lost track of this upload, so nothing was read. Please upload the file again.' };
  }
  if (!presignAvailable() && !devStoreOn()) {
    return { ok: false, code: 'unavailable', message: 'Uploads are switched off right now. This is on our side, not your file. Please try again later, or email the file to precon@ilcstudios.com.' };
  }
  try {
    const raw = await gunzip(presignAvailable()
      ? Buffer.from(await (await s3Client().send(new GetObjectCommand({
          Bucket: process.env.S3_BUCKET, Key: key,
        }))).Body.transformToByteArray())
      : await devGet(key));
    return { ok: true, state: JSON.parse(raw.toString('utf8')) };
  } catch (err) {
    // `quiet` marks probes for objects that may legitimately not exist yet
    // (a scan shard's first slice, the matrix's parked answer), a miss there
    // is the expected case, not a fault worth an error line.
    if (!quiet) {
      console.error('[uploadStorage] getScanState failed for key', key, err?.name ?? err?.message ?? err);
    }
    return {
      ok: false,
      code: 'scan_expired',
      message: 'This upload timed out before we finished reading it. Please upload the file again.',
    };
  }
}

/** Best-effort delete once the last stage is done. Never throws. */
export async function deleteScanState(key) {
  if (!isScanKey(key) || (!presignAvailable() && !devStoreOn())) return false;
  if (!presignAvailable()) return devDel(key);
  try {
    await s3Client().send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key,
    }));
    return true;
  } catch (err) {
    console.error('[uploadStorage] deleteScanState failed', err?.message ?? err);
    return false;
  }
}

// ── The "last risky thing started" marker ────────────────────────────────────
// pdfjs draws a sheet in one synchronous bite, and one Skyline Ridge sheet
// proved that bite can run ~4 seconds on a laptop, 3-5x that at Lambda pace
// during which the event loop never turns. A timeout raced against that render
// cannot fire: the race needs the event loop, and the event loop is the thing
// that is blocked. So the front door hangs up at ~28s, the Lambda dies
// mid-bite, nothing gets parked, and the retry replays the identical death
// measured at 28.1s three times in a row, twice, under two different rounds of
// guard logic that never got to run.
//
// The marker is the answer that doesn't need to preempt anything: the render
// stage writes the NAME of each risky piece of work here, a few dozen bytes,
// BEFORE starting it, and overwrites it before the next one. It is never
// deleted mid-read. Whether the work finished is not the marker's business
// the parked scan state records completion, so a retry that finds the marker
// naming the exact piece it is ABOUT to start knows that piece already ate a
// whole request alive, and skips it. The 504 itself becomes the probe.

/** One marker per scan, parked beside the scan state. */
const attemptKeyFor = (scanKey) =>
  isScanKey(scanKey) ? scanKey.replace(/\.json\.gz$/i, '.attempt.json') : null;

/** @returns {Promise<boolean>} false means no protection this attempt, never fatal. */
export async function putScanAttempt(scanKey, attempt) {
  const key = attemptKeyFor(scanKey);
  if (!key || !attempt || (!presignAvailable() && !devStoreOn())) return false;
  try {
    const body = Buffer.from(JSON.stringify(attempt), 'utf8');
    if (!presignAvailable()) { await devPut(key, body); return true; }
    await s3Client().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key, Body: body,
      ContentType: 'application/json',
    }));
    return true;
  } catch (err) {
    console.error('[uploadStorage] putScanAttempt failed', err?.message ?? err);
    return false;
  }
}

/** @returns {Promise<object|null>} null is the normal case, no attempt parked. */
export async function getScanAttempt(scanKey) {
  const key = attemptKeyFor(scanKey);
  if (!key || (!presignAvailable() && !devStoreOn())) return null;
  try {
    const raw = presignAvailable()
      ? Buffer.from(await (await s3Client().send(new GetObjectCommand({
          Bucket: process.env.S3_BUCKET, Key: key,
        }))).Body.transformToByteArray())
      : await devGet(key);
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

/** Best-effort sweep alongside deleteScanState. Never throws. */
export async function deleteScanAttempt(scanKey) {
  const key = attemptKeyFor(scanKey);
  if (!key || (!presignAvailable() && !devStoreOn())) return false;
  if (!presignAvailable()) return devDel(key);
  try {
    await s3Client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a stored sheet's bytes back.
 *
 * The vision read needs the PNG of a sheet, and rendering one costs ~4 seconds
 * apiece. Doing that again inside the site-data stage would push it to ~33
 * seconds and back over the front door's limit, the exact wall this staging
 * exists to get under. So the render stage stores what it made and this hands
 * it back, turning a 4-second re-render into a sub-second fetch.
 *
 * @returns {Promise<Buffer|null>} null if it is gone; the caller decides whether
 *          that is fatal (the site read) or cosmetic (a reviewer's thumbnail).
 */
export async function getSheetImage(key) {
  if (!isSheetKey(key)) return null;
  if (!presignAvailable()) {
    if (!devStoreOn()) return null;
    return devGet(key).catch(() => null);
  }
  try {
    const res = await s3Client().send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key,
    }));
    return Buffer.from(await res.Body.transformToByteArray());
  } catch (err) {
    console.error('[uploadStorage] getSheetImage failed for key', key, err?.name ?? err?.message ?? err);
    return null;
  }
}

/** Best-effort delete of a stored sheet. Used for the render stage's working
 *  PNGs, which are scaffolding, the kept JPEGs a reviewer looks at survive. */
export async function deleteSheetImage(key) {
  if (!isSheetKey(key)) return false;
  if (!presignAvailable()) return devStoreOn() ? devDel(key) : false;
  try {
    await s3Client().send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key,
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * A short-lived link to view a kept sheet.
 *
 * Read-only and expiring, so the caller decides who gets one, the only route
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
