// Where Sales Docs files live (0137).
//
// Prod: the S3 bucket, under sales-docs/{docId}/{versionId}/, NOT uploads/,
// because uploads/ is swept a day after a file lands and a shared price sheet
// has to still be there next year. The browser PUTs the file to uploads/ with
// the usual permission slip; the create route copies it here.
//
// Dev (no S3_BUCKET): a local folder, so every path below runs before it ships.
//
// The bucket only allows cross-origin PUT, so nothing here hands the browser
// a GET url except the download, which is a top-level navigation (no CORS).
// The viewer reads the PDF in slices through our own cookie-checked route.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  CopyObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from '../qcStorage.js';
import { getUploadedObject, isUploadKey, MAX_SALESDOC_UPLOAD_BYTES } from '../uploadStorage.js';

const DEV_DIR = path.join(process.cwd(), '.salesdocs-dev');
const DOWNLOAD_TTL_SECONDS = 300;

export const salesDocS3On = () => !!process.env.S3_BUCKET;
const devOn = () => !salesDocS3On() && process.env.NODE_ENV !== 'production';

/** The permanent key for one file of one version. */
export function salesDocKey(docId, versionId, name) {
  const safe = String(name).toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `sales-docs/${docId}/${versionId}/${safe}`;
}

/** True only for keys salesDocKey could have made. */
export function isSalesDocKey(key) {
  return typeof key === 'string'
    && /^sales-docs\/[a-z0-9]+\/[a-z0-9]+\/[a-z0-9._-]+$/.test(key)
    && !key.includes('..');
}

const devPath = (key) => path.join(DEV_DIR, key.replace(/[^a-z0-9._-]/gi, '_'));

function unavailable() {
  const err = new Error('File storage is not set up here.');
  err.code = 'unavailable';
  return err;
}

/** Store bytes at a permanent key. Throws on failure, never silent. */
export async function putSalesDocObject(key, buffer, contentType = 'application/octet-stream') {
  if (!isSalesDocKey(key)) throw new Error('Not a Sales Docs key.');
  if (salesDocS3On()) {
    await s3Client().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: contentType,
    }));
    return key;
  }
  if (!devOn()) throw unavailable();
  await fs.mkdir(DEV_DIR, { recursive: true });
  await fs.writeFile(devPath(key), buffer);
  return key;
}

/**
 * Move a direct upload (uploads/salesdoc/...) to its permanent key. In S3 this
 * is a server-side copy, so a 50 MB file never passes through the Lambda.
 * @returns {Promise<number>} the stored size in bytes
 */
export async function keepUpload(uploadKey, key) {
  if (!isSalesDocKey(key)) throw new Error('Not a Sales Docs key.');
  if (!isUploadKey(uploadKey) || !uploadKey.startsWith('uploads/salesdoc/')) throw new Error('Not a valid upload reference.');
  if (salesDocS3On()) {
    const head = await s3Client().send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: uploadKey }));
    const size = head.ContentLength ?? 0;
    if (size > MAX_SALESDOC_UPLOAD_BYTES) throw new Error('That file is larger than 50 MB.');
    await s3Client().send(new CopyObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      CopySource: `${process.env.S3_BUCKET}/${uploadKey}`,
      ContentType: head.ContentType || 'application/octet-stream',
      MetadataDirective: 'REPLACE',
    }));
    return size;
  }
  const got = await getUploadedObject(uploadKey, { limit: MAX_SALESDOC_UPLOAD_BYTES });
  if (!got.ok) throw new Error(got.message);
  await putSalesDocObject(key, got.buffer);
  return got.buffer.length;
}

/** Whole object. Used by processing (50 MB ceiling) and rendered sheets. */
export async function getSalesDocObject(key) {
  if (!isSalesDocKey(key)) throw new Error('Not a Sales Docs key.');
  if (salesDocS3On()) {
    const res = await s3Client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return Buffer.from(await res.Body.transformToByteArray());
  }
  if (!devOn()) throw unavailable();
  return fs.readFile(devPath(key));
}

/** Bytes [start, end] inclusive. The viewer asks for a PDF a slice at a time. */
export async function getSalesDocRange(key, start, end) {
  if (!isSalesDocKey(key)) throw new Error('Not a Sales Docs key.');
  if (salesDocS3On()) {
    const res = await s3Client().send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key, Range: `bytes=${start}-${end}`,
    }));
    return Buffer.from(await res.Body.transformToByteArray());
  }
  if (!devOn()) throw unavailable();
  const fh = await fs.open(devPath(key), 'r');
  try {
    const buf = Buffer.alloc(end - start + 1);
    const { bytesRead } = await fh.read(buf, 0, buf.length, start);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/**
 * A short-lived download link that saves the file under its own name.
 * Null in dev; the download route streams the bytes instead.
 */
export async function presignSalesDocDownload(key, fileName) {
  if (!isSalesDocKey(key) || !salesDocS3On()) return null;
  const safeName = String(fileName || 'document').replace(/["\\\r\n]/g, '');
  return getSignedUrl(s3Client(), new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeName}"`,
  }), { expiresIn: DOWNLOAD_TTL_SECONDS });
}

/** Where one rendered sheet of a workbook is kept (JSON file, not a column). */
export const renderedSheetKey = (docId, versionId, index) => salesDocKey(docId, versionId, `sheet-${index}.json`);
