// QC bug-tracker media storage.
//
// In production (S3_BUCKET env var is set), screenshots go to S3.
// In local dev (S3_BUCKET is undefined), they go to the local filesystem
// at uploads/qc/, served back through /api/qc/media?key=...
//
// The S3 path is what enables persistent storage on AWS Amplify, where
// the Lambda filesystem is ephemeral. Setup walkthrough is in
// G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\Z_Completed\
// QC Bug Tracker, S3 Setup for Production.md
//
// S3_BUCKET / S3_REGION must be in next.config.mjs's env block, this
// file is webpack-bundled, so without those entries, process.env.S3_BUCKET
// inlines as undefined and the prod path silently dies. Same trap as
// DATABASE_URL.

import { createId } from '@paralleldrive/cuid2';
import fs from 'fs';
import path from 'path';

// Static imports of the AWS SDK. The packages are in
// serverComponentsExternalPackages (in next.config.mjs), so they're loaded
// via require() at runtime, not bundled, but importing them statically
// at the top of this file is more reliable than dynamic await import(),
// which has bitten us on Amplify SSR.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Evaluated per call (not at module-load) so a stale bundler-inlined value
// can't pin us to the wrong branch for the lifetime of a Lambda warm pool.
function isProd() {
  return !!process.env.S3_BUCKET;
}

// ── Dev: local filesystem ────────────────────────────────────────────────────

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function putLocal(buffer, { ext = 'png' } = {}) {
  const dir = path.join(process.cwd(), 'uploads', 'qc');
  ensureDir(dir);
  const filename = `${createId()}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `qc/${filename}`;
}

function getLocalUrl(key) {
  return `/api/qc/media?key=${encodeURIComponent(key)}`;
}

// ── Prod: S3 ─────────────────────────────────────────────────────────────────

// The Amplify SSR Lambda runs without a usable IAM identity (the SDK
// returned CredentialsProviderError: "Could not load credentials from any
// providers" on first attempt), so we pass an explicit access key from
// env vars instead of relying on the default credential chain.
//
// S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are deliberately NOT AWS_-
// prefixed because AWS reserves the AWS_* env var namespace in Lambda
// execution environments, setting AWS_ACCESS_KEY_ID there is blocked
// or silently ignored.
//
// If both env vars are absent, we fall back to the default chain, that's
// the path that works once a proper SSR compute role is set up (planned
// for the security pass).
// Exported for uploadStorage.js (direct-to-S3 uploads), one place owns the
// credential fallback logic, so a future switch to an SSR compute role is a
// one-file change.
export function s3Client() {
  const region = process.env.S3_REGION || 'us-east-2';
  const id     = process.env.S3_ACCESS_KEY_ID;
  const secret = process.env.S3_SECRET_ACCESS_KEY;
  // Dualstack matters for the PRESIGNED urls this client mints: the standard
  // bucket hostname has no IPv6 address (checked 2026-08-29, no AAAA
  // record), so a phone on an IPv6-only carrier network loads the site fine
  // and then can't reach the bucket at all. The upload dies before the first
  // byte (the U3 error) while the same page works on office wifi. The
  // dualstack hostname answers on both protocols; server-side reads through
  // this client are unaffected either way.
  if (id && secret) {
    return new S3Client({
      region,
      useDualstackEndpoint: true,
      credentials: { accessKeyId: id, secretAccessKey: secret },
    });
  }
  return new S3Client({ region, useDualstackEndpoint: true });
}

async function putS3(buffer, { ext = 'png', contentType = 'image/png' } = {}) {
  const key = `qc/${createId()}.${ext}`;
  await s3Client().send(new PutObjectCommand({
    Bucket:      process.env.S3_BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));
  return key;
}

async function getS3Url(key) {
  return getSignedUrl(s3Client(), new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key:    key,
  }), { expiresIn: 900 }); // 15 minutes
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function putQcObject(buffer, opts = {}) {
  return isProd() ? putS3(buffer, opts) : putLocal(buffer, opts);
}

// Never throws. A failure to sign a URL (bad key, missing credentials,
// SDK quirk, whatever) returns null instead of crashing the caller. The
// /admin/tasks page serializes all bug-report rows on every load, so one
// bad screenshotKey would otherwise take out the entire board.
export async function getQcObjectUrl(key) {
  if (!key) return null;
  try {
    return isProd() ? await getS3Url(key) : getLocalUrl(key);
  } catch (err) {
    console.error('[qcStorage] getQcObjectUrl failed for key', key, err?.message ?? err);
    return null;
  }
}

// Best-effort delete, returns true on success, false on failure. We don't
// throw because deleting the underlying DB row is the user-visible outcome;
// an orphan blob in S3 is harmless and we'd rather not block the row delete
// on an S3 hiccup.
export async function deleteQcObject(key) {
  if (!key) return true;
  try {
    if (isProd()) {
      await s3Client().send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key:    key,
      }));
    } else {
      const filename = key.replace(/^qc\//, '');
      const file = path.join(process.cwd(), 'uploads', 'qc', filename);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    return true;
  } catch (err) {
    console.error('[qcStorage] deleteQcObject failed for key', key, err?.message ?? err);
    return false;
  }
}
