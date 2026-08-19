// Project file storage — permanent records attached to ProjectFile rows.
//
// In prod (S3_BUCKET set): files go to S3 under the project-files/ prefix,
// which the bucket's lifecycle rule does NOT match (the rule targets uploads/
// only — that prefix is for transient direct-upload scratch files).
//
// In dev (no S3_BUCKET): falls back to the local filesystem at
// uploads/{storedPath}, identical to the pre-S3 behaviour so local dev
// requires no extra config.
//
// storedPath format in the DB:
//   S3 (prod):  "project-files/{projectId}/{tab}/{stored}"
//   Local (dev): "{projectId}/{tab}/{stored}"
//
// All readers check storedPath.startsWith('project-files/') to branch.

import path from 'path';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function isProd() {
  return !!process.env.S3_BUCKET;
}

function s3() {
  const region = process.env.S3_REGION || 'us-east-2';
  const id     = process.env.S3_ACCESS_KEY_ID;
  const secret = process.env.S3_SECRET_ACCESS_KEY;
  if (id && secret) return new S3Client({ region, credentials: { accessKeyId: id, secretAccessKey: secret } });
  return new S3Client({ region });
}

// Write a file and return the storedPath key to persist in the DB.
export async function putProjectFile(buffer, { projectId, tab, stored, contentType = 'application/octet-stream' }) {
  if (isProd()) {
    const key = `project-files/${projectId}/${tab}/${stored}`;
    await s3().send(new PutObjectCommand({
      Bucket:      process.env.S3_BUCKET,
      Key:         key,
      Body:        buffer,
      ContentType: contentType,
    }));
    return key;
  }
  const dir = path.join(process.cwd(), 'uploads', projectId, tab);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, stored), buffer);
  return `${projectId}/${tab}/${stored}`;
}

// Return a 1-hour presigned GET URL for an S3-backed storedPath, or null for
// local paths. Callers that need a URL redirect use this; callers that need a
// buffer call getProjectFileBuffer instead.
export async function getProjectFileUrl(storedPath) {
  if (!storedPath?.startsWith('project-files/')) return null;
  try {
    return await getSignedUrl(s3(), new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key:    storedPath,
    }), { expiresIn: 3600 });
  } catch {
    return null;
  }
}

// Fetch the raw bytes for a file, wherever it lives. Returns null on failure
// so callers can return a clean 404 rather than crashing.
export async function getProjectFileBuffer(storedPath) {
  if (!storedPath) return null;
  if (storedPath.startsWith('project-files/')) {
    try {
      const url  = await getProjectFileUrl(storedPath);
      if (!url) return null;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return Buffer.from(await resp.arrayBuffer());
    } catch { return null; }
  }
  try {
    return await readFile(path.join(process.cwd(), 'uploads', storedPath));
  } catch { return null; }
}

// Best-effort delete — returns true on success, false on failure. Callers
// still delete the DB row on failure; an orphan blob is harmless.
export async function deleteProjectFile(storedPath) {
  if (!storedPath) return true;
  try {
    if (storedPath.startsWith('project-files/')) {
      await s3().send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key:    storedPath,
      }));
    } else {
      await unlink(path.join(process.cwd(), 'uploads', storedPath));
    }
    return true;
  } catch { return false; }
}
