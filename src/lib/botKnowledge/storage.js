// Where Bot Knowledge files live.
//
// Same shape as projectFileStorage.js — S3 in prod, the local uploads folder in
// dev so nobody needs AWS credentials to work on this. The prefix is its own
// (`bot-knowledge/`) so the bucket's lifecycle rule, which sweeps the transient
// `uploads/` prefix, never touches these. They are meant to be kept.

import path from 'path';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const PREFIX = 'bot-knowledge/';

function isProd() {
  return !!process.env.S3_BUCKET;
}

function s3() {
  const region = process.env.S3_REGION || 'us-east-2';
  const id     = process.env.S3_ACCESS_KEY_ID;
  const secret = process.env.S3_SECRET_ACCESS_KEY;
  // Dualstack because the presigned links go to browsers, and a phone on an
  // IPv6-only carrier cannot resolve the plain bucket hostname.
  if (id && secret) return new S3Client({ region, useDualstackEndpoint: true, credentials: { accessKeyId: id, secretAccessKey: secret } });
  return new S3Client({ region, useDualstackEndpoint: true });
}

// Keep the original name recognisable in the key, but strip anything that could
// walk out of the prefix or upset S3.
export function safeStoredName(fileName) {
  const base = String(fileName || 'file').split(/[\\/]/).pop();
  return `${Date.now()}-${base.replace(/[^a-zA-Z0-9._-]/g, '_')}`.slice(0, 200);
}

export async function putKnowledgeFile(buffer, { stored, contentType = 'application/octet-stream' }) {
  if (isProd()) {
    const key = `${PREFIX}${stored}`;
    await s3().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: contentType,
    }));
    return key;
  }
  const dir = path.join(process.cwd(), 'uploads', 'bot-knowledge');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, stored), buffer);
  return `bot-knowledge-local/${stored}`;
}

export async function getKnowledgeFileUrl(storedPath) {
  if (!storedPath?.startsWith(PREFIX)) return null;
  try {
    return await getSignedUrl(s3(), new GetObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: storedPath,
    }), { expiresIn: 3600 });
  } catch {
    return null;
  }
}

export async function getKnowledgeFileBuffer(storedPath) {
  if (!storedPath) return null;
  if (storedPath.startsWith(PREFIX)) {
    try {
      const url = await getKnowledgeFileUrl(storedPath);
      if (!url) return null;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return Buffer.from(await resp.arrayBuffer());
    } catch { return null; }
  }
  try {
    return await readFile(path.join(process.cwd(), 'uploads', 'bot-knowledge', storedPath.replace('bot-knowledge-local/', '')));
  } catch { return null; }
}

// Best effort — the DB row is deleted either way. An orphaned blob is harmless;
// a row pointing at a file nobody can find is not.
export async function deleteKnowledgeFile(storedPath) {
  if (!storedPath) return true;
  try {
    if (storedPath.startsWith(PREFIX)) {
      await s3().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: storedPath }));
    } else {
      await unlink(path.join(process.cwd(), 'uploads', 'bot-knowledge', storedPath.replace('bot-knowledge-local/', '')));
    }
    return true;
  } catch { return false; }
}
