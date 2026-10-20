// Shared by create and replace (0137): take the uploaded file (direct-to-S3
// key or, under 4 MB, the form body) and keep it at its permanent key.
import { MAX_SALESDOC_UPLOAD_BYTES, deleteUploadedObject } from '@/lib/uploadStorage';
import { keepUpload, putSalesDocObject, salesDocKey } from '@/lib/salesDocs/storage';
import { kindFromName, MIME } from '@/lib/salesDocs/access';

/** Read the file fields off the form. @returns {{ error } | { fileName, kind, uploadKey, file }} */
export function readFileFields(form) {
  const uploadKey = form.get('uploadKey');
  const file = form.get('file');
  const fileName = String((uploadKey ? form.get('fileName') : file?.name) || '').slice(0, 255);
  if (!uploadKey && (!file || typeof file === 'string')) return { error: 'Pick a PDF or .xlsx file.' };
  const kind = kindFromName(fileName);
  if (!kind) return { error: 'Sales Docs takes PDF and .xlsx files only.' };
  if (file && typeof file !== 'string' && file.size > MAX_SALESDOC_UPLOAD_BYTES) return { error: 'That file is larger than 50 MB.' };
  return { fileName, kind, uploadKey: uploadKey ? String(uploadKey) : null, file: uploadKey ? null : file };
}

/** Store the bytes for one version. @returns {Promise<{ storageKey, sizeBytes }>} */
export async function storeVersionFile({ docId, versionId, kind, uploadKey, file }) {
  const storageKey = salesDocKey(docId, versionId, kind === 'PDF' ? 'file.pdf' : 'file.xlsx');
  if (uploadKey) {
    const sizeBytes = await keepUpload(uploadKey, storageKey);
    deleteUploadedObject(uploadKey).catch(() => {});
    return { storageKey, sizeBytes };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  await putSalesDocObject(storageKey, buffer, MIME[kind]);
  return { storageKey, sizeBytes: buffer.length };
}
