// Server side of "the bytes may not have come through the front door".
//
// Amplify rejects request bodies over ~4.4 MB before our code runs, so a 25 MB
// construction schedule can never travel THROUGH the app. The browser instead
// PUTs it straight to S3 (see src/lib/uploadClient.js) and sends us only a key.
//
// Every upload route now reads its bytes through readUploadedFile() and stops
// caring which way they arrived:
//
//   classic  — FormData carries `file`      (small files, and all of local dev)
//   direct   — FormData carries `uploadKey` + `fileName` + `fileType`
//
// Keeping BOTH inside FormData is deliberate: routes still parse `tab`, `tags`
// and friends exactly as they did, and only the line that gets the bytes moves.
//
// The temp object lives under uploads/, which has a 1-day expiry rule, so a
// forgotten cleanup() costs a day of storage rather than an orphan forever.

import { getUploadedObject, deleteUploadedObject, MAX_PROJECT_UPLOAD_BYTES } from './uploadStorage.js';

const noop = async () => false;

/**
 * @param {FormData} formData
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<
 *   | { ok: true, buffer: Buffer, name: string, type: string, uploadKey: string|null, cleanup: () => Promise<boolean> }
 *   | { ok: false, status: number, message: string }
 * >}
 */
export async function readUploadedFile(formData, { limit = MAX_PROJECT_UPLOAD_BYTES } = {}) {
  const rawKey = formData.get('uploadKey');

  if (rawKey) {
    const key = String(rawKey);
    // Name first: it costs nothing, and everything downstream (the stored file
    // name, the AI prompt, the page title) needs the original. Fetching the
    // bytes only to reject them would be a wasted download.
    const name = String(formData.get('fileName') || '').trim();
    if (!name) return { ok: false, status: 400, message: 'The upload was missing its file name. Please try again.' };
    const got = await getUploadedObject(key, { limit });
    if (!got.ok) {
      // too_large is the one the browser can act on; everything else means the
      // slip expired or was swept, which reads as "try the upload again".
      return { ok: false, status: got.code === 'too_large' ? 413 : 400, message: got.message };
    }
    return {
      ok: true,
      buffer: got.buffer,
      name,
      type: String(formData.get('fileType') || '') || 'application/octet-stream',
      uploadKey: key,
      cleanup: () => deleteUploadedObject(key),
    };
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return { ok: false, status: 400, message: 'No file provided' };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > limit) {
    return { ok: false, status: 413, message: `That file is larger than ${Math.round(limit / (1024 * 1024))} MB.` };
  }
  return {
    ok: true,
    buffer,
    name: file.name,
    type: file.type || 'application/octet-stream',
    uploadKey: null,
    cleanup: noop,
  };
}

/**
 * Multi-file version, for the two windows that accept a whole drawing set at
 * once. Same two shapes:
 *
 *   classic — FormData carries repeated `files`
 *   direct  — FormData carries `uploadKeys`, a JSON array of
 *             { key, name, type }, one per file
 *
 * A single bad entry fails the whole batch rather than importing a partial set
 * silently — these callers treat the drop as one submission.
 *
 * @returns {Promise<{ ok: true, files: Array<{buffer: Buffer, name: string, type: string}>, cleanup: () => Promise<void> }
 *                 | { ok: false, status: number, message: string }>}
 */
export async function readUploadedFiles(formData, { limit = MAX_PROJECT_UPLOAD_BYTES, field = 'files' } = {}) {
  const out = [];
  const keys = [];

  // Both sources are read, not one-or-the-other: a drawing set can be a mix of
  // PDFs (which go straight to S3) and something we don't presign, and the two
  // halves of that set must arrive as one submission.
  const raw = formData.get('uploadKeys');
  if (raw) {
    let entries;
    try { entries = JSON.parse(String(raw)); } catch { entries = null; }
    if (!Array.isArray(entries)) {
      return { ok: false, status: 400, message: 'The upload references were unreadable. Please try again.' };
    }
    for (const entry of entries) {
      const key = String(entry?.key ?? '');
      const got = await getUploadedObject(key, { limit });
      if (!got.ok) return { ok: false, status: got.code === 'too_large' ? 413 : 400, message: got.message };
      out.push({
        buffer: got.buffer,
        name:   String(entry?.name || 'upload.pdf'),
        type:   String(entry?.type || '') || 'application/octet-stream',
      });
      keys.push(key);
    }
  }

  for (const file of formData.getAll(field)) {
    if (!file || typeof file === 'string') continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > limit) {
      return { ok: false, status: 413, message: `${file.name} is larger than ${Math.round(limit / (1024 * 1024))} MB.` };
    }
    out.push({ buffer, name: file.name, type: file.type || 'application/octet-stream' });
  }

  if (!out.length) return { ok: false, status: 400, message: 'No files provided' };

  return {
    ok: true,
    files: out,
    cleanup: async () => { for (const key of keys) await deleteUploadedObject(key); },
  };
}
