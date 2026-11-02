// Browser side of a receipt: shrink a big photo, store it, then ask for the read.
// A failed read loses nothing: the receipt is already stored and waits on the list.
import { appendUpload } from '@/lib/uploadClient';
import { postParked } from '@/lib/parkedFetch';
import { receiptExt, WRONG_TYPE_MESSAGE } from '@/lib/sales/receipts';

const LONG_SIDE = 2000;
const SHRINK_OVER_BYTES = 1.5 * 1024 * 1024;
const HEIC_MESSAGE = 'That photo is in the iPhone HEIC format, which this browser cannot open. Nothing was saved. Use Take a photo, or save it as a JPG.';
const NO_SIGNAL = 'No signal reaching our server. Nothing was saved. Check your connection and try again.';

const isHeic = (file) => /\.(heic|heif)$/i.test(file.name || '') || /heic|heif/i.test(file.type || '');

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

// A phone photo can be 8 MB and the reader takes 5, so big pictures go in as a
// smaller JPG. Small ones are sent exactly as they are.
export async function prepareReceiptFile(file) {
  const heic = isHeic(file);
  const ext = heic ? 'jpg' : receiptExt(file.name, file.type);
  if (!ext) throw new Error(WRONG_TYPE_MESSAGE);
  const picture = heic || ext === 'jpg' || ext === 'png';
  if (!picture) return file;

  let img;
  try { img = await loadImage(file); }
  catch { throw new Error(heic ? HEIC_MESSAGE : 'That picture did not open. Nothing was saved. Try another copy.'); }

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (!heic && file.size <= SHRINK_OVER_BYTES && longest <= LONG_SIDE) return file;

  const scale = Math.min(1, LONG_SIDE / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error(heic ? HEIC_MESSAGE : 'That picture did not open. Nothing was saved. Try another copy.');
  const name = `${(file.name || 'receipt').replace(/\.[^.]+$/, '')}.jpg`;
  return new File([blob], name, { type: 'image/jpeg' });
}

export async function readReceipt(id, { onWait } = {}) {
  const res = await postParked(`/api/sales/expenses/receipts/${id}/read`, {}, { onWait });
  const data = res.data || {};
  if (!res.ok) {
    throw new Error(data.message || data.error || `The receipt is saved, but the read did not finish. Press Try again. (HTTP ${res.status})`);
  }
  return data.receipt;
}

// onStage(words) gets a short line for the screen. Returns { receipt, duplicate }.
// readError is set when the file stored fine and only the read failed.
export async function sendReceipt(file, { source = 'DROP', onStage = () => {} } = {}) {
  onStage('Getting it ready');
  const ready = await prepareReceiptFile(file);

  onStage('Saving');
  const form = new FormData();
  let res;
  try {
    await appendUpload(form, ready, { scope: 'receipt' });
    form.append('source', source);
    res = await fetch('/api/sales/expenses/receipts', { method: 'POST', body: form });
  } catch (e) {
    throw new Error(e instanceof TypeError ? NO_SIGNAL : e.message);
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `The receipt did not save on our server. Try again. (HTTP ${res.status})`);
  if (out.duplicate) return { receipt: out.receipt, duplicate: true };

  onStage('Reading');
  try {
    const receipt = await readReceipt(out.receipt.id);
    return { receipt, duplicate: false };
  } catch (e) {
    return { receipt: out.receipt, duplicate: false, readError: e instanceof TypeError ? NO_SIGNAL : e.message };
  }
}
