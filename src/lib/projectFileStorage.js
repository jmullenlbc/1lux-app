// Project file storage, permanent records attached to ProjectFile rows.
//
// In prod (S3_BUCKET set): files go to S3 under the project-files/ prefix,
// which the bucket's lifecycle rule does NOT match (the rule targets uploads/
// only, that prefix is for transient direct-upload scratch files).
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
import { mkdir, writeFile, readFile, unlink, open } from 'fs/promises';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { objectStoreOn, s3Client } from './objectStore.js';

function isProd() {
  return objectStoreOn();
}

// The shared client (objectStore.js): AWS S3 or any S3-compatible store.
const s3 = () => s3Client();

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

// Keep a file that went straight to S3 without pulling it through our server,
// the Job Loader's way of holding a set too big for one request. S3 only, a
// browser in dev sends the bytes in the form body and uses putProjectFile.
export async function keepProjectUpload(uploadKey, { projectId, tab, stored }) {
  const key = `project-files/${projectId}/${tab}/${stored}`;
  const head = await s3().send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: uploadKey }));
  await s3().send(new CopyObjectCommand({
    Bucket:            process.env.S3_BUCKET,
    Key:               key,
    CopySource:        `${process.env.S3_BUCKET}/${uploadKey}`,
    ContentType:       head.ContentType || 'application/octet-stream',
    MetadataDirective: 'REPLACE',
  }));
  return { storedPath: key, size: head.ContentLength ?? 0 };
}

// Return a 1-hour presigned GET URL for an S3-backed storedPath, or null for
// local paths. Callers that need a URL redirect use this; callers that need a
// buffer call getProjectFileBuffer instead. Pass name and contentType when the
// link goes to a browser, so the file opens in place under its own name.
export async function getProjectFileUrl(storedPath, { name, contentType } = {}) {
  if (!storedPath?.startsWith('project-files/')) return null;
  try {
    return await getSignedUrl(s3(), new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key:    storedPath,
      ...(name ? { ResponseContentDisposition: `inline; filename="${encodeURIComponent(name)}"` } : {}),
      ...(contentType ? { ResponseContentType: contentType } : {}),
    }), { expiresIn: 3600 });
  } catch {
    return null;
  }
}

// Bytes [start, end] inclusive, for the viewers that read a PDF a slice at a
// time. Returns null on failure, same as getProjectFileBuffer.
export async function getProjectFileRange(storedPath, start, end) {
  if (!storedPath) return null;
  if (storedPath.startsWith('project-files/')) {
    try {
      const res = await s3().send(new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key:    storedPath,
        Range:  `bytes=${start}-${end}`,
      }));
      return Buffer.from(await res.Body.transformToByteArray());
    } catch { return null; }
  }
  try {
    const handle = await open(path.join(process.cwd(), 'uploads', storedPath), 'r');
    try {
      const buf = Buffer.alloc(end - start + 1);
      const { bytesRead } = await handle.read(buf, 0, buf.length, start);
      return buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch { return null; }
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

// Best-effort delete, returns true on success, false on failure. Callers
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
