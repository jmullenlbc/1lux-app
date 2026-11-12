// The one place that knows where uploaded files live (2026-11-12).
//
// Any S3-compatible bucket works, so the app can move between hosts (Render now, Replit later) without copying
// files: the bucket stays put and only the settings travel. See docs/hosting/storage.md.
//
//   S3_BUCKET              bucket name. Unset = no bucket: every storage module falls back to the local disk
//                          (fine for development, lost on every deploy of a hosted copy).
//   S3_ACCESS_KEY_ID       access key for that bucket only
//   S3_SECRET_ACCESS_KEY
//   S3_REGION              AWS region (default us-east-2); "auto" for Cloudflare R2
//   S3_ENDPOINT            leave unset for AWS S3. For Cloudflare R2, Backblaze B2, MinIO and other
//                          S3-compatible stores: their endpoint URL, e.g. https://<account>.r2.cloudflarestorage.com
//   S3_FORCE_PATH_STYLE    "true" for stores that need bucket-in-path addressing (MinIO, some B2 setups)
//
// Names are S3_* and not AWS_* because AWS reserves AWS_* inside Lambda (the old Amplify host). Without keys the
// client falls back to the SDK's default credential chain (an IAM role on AWS compute).

import { S3Client } from '@aws-sdk/client-s3';

const truthy = v => /^(1|true|yes)$/i.test(String(v || '').trim());

// Read per call, never at module load: a stale value must not pin a long-lived server to the wrong branch.
export function storageSettings(env = process.env) {
  const endpoint = String(env.S3_ENDPOINT || '').trim().replace(/\/+$/, '');
  return {
    bucket: String(env.S3_BUCKET || '').trim(),
    region: String(env.S3_REGION || '').trim() || (endpoint ? 'auto' : 'us-east-2'),
    endpoint,
    forcePathStyle: truthy(env.S3_FORCE_PATH_STYLE),
    accessKeyId: env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
  };
}

// True when a bucket is configured; every storage module branches on this.
export function objectStoreOn(env = process.env) {
  return !!storageSettings(env).bucket;
}

export function bucketName(env = process.env) {
  return storageSettings(env).bucket;
}

// Options for the S3 client, kept pure so tests can check them without a network.
export function s3ClientOptions(env = process.env) {
  const s = storageSettings(env);
  const opts = { region: s.region };
  if (s.endpoint) {
    // A custom endpoint is used exactly as given. AWS's dualstack hostnames do not exist there.
    opts.endpoint = s.endpoint;
    if (s.forcePathStyle) opts.forcePathStyle = true;
  } else {
    // AWS S3: the dualstack hostname answers on IPv6 too. Presigned links go to browsers, and a phone on an
    // IPv6-only carrier network cannot reach the plain bucket hostname (no AAAA record, found 2026-08-29).
    opts.useDualstackEndpoint = true;
    if (s.forcePathStyle) opts.forcePathStyle = true;
  }
  if (s.accessKeyId && s.secretAccessKey) {
    opts.credentials = { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey };
  }
  return opts;
}

export function s3Client(env = process.env) {
  return new S3Client(s3ClientOptions(env));
}

// Which kind of store is configured, for status screens and logs. Never includes keys.
export function storageDescription(env = process.env) {
  const s = storageSettings(env);
  if (!s.bucket) return { kind: 'local-disk', bucket: null, endpointHost: null };
  let endpointHost = null;
  try { endpointHost = s.endpoint ? new URL(s.endpoint).host : null; } catch { endpointHost = 'invalid S3_ENDPOINT'; }
  return { kind: s.endpoint ? 's3-compatible' : 'aws-s3', bucket: s.bucket, endpointHost, region: s.region };
}
