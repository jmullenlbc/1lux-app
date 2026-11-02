// Receipts on Expenses. Pure: no database, safe in the browser and under plain
// node. The AI's guess lives on ExpenseReceipt until a person confirms it, so
// nothing here ever touches a total.
import { cents } from '../money.js';
import { EXPENSE_CATEGORY_KEYS } from './expenses.js';

export const RECEIPT_ACCEPT = '.pdf,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_RECEIPT_BYTES = 25 * 1024 * 1024;
export const MAX_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024; // the AI service refuses bigger images
export const MAX_RECEIPT_PDF_BYTES = 20 * 1024 * 1024;

// A read older than this died part way, so Try again shows.
export const READ_STUCK_MS = 3 * 60 * 1000;

export const MIME_BY_EXT = {
  pdf:  'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
  png:  'image/png',
  jpg:  'image/jpeg',
};

const EXT_BY_MIME = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
};

export const WRONG_TYPE_MESSAGE = 'That file type does not work here. Use PDF, Excel, JPG or PNG. Nothing was saved.';

// Phones often hand over a file with no extension, so the type is the fallback.
export function receiptExt(name, type) {
  const raw = String(name || '').includes('.') ? String(name).split('.').pop().toLowerCase() : '';
  const ext = raw === 'jpeg' ? 'jpg' : raw;
  if (MIME_BY_EXT[ext]) return ext;
  return EXT_BY_MIME[String(type || '').toLowerCase()] || '';
}

// What the bytes really are. A renamed file does not get through on its name.
export function sniffReceipt(buffer) {
  const b = buffer;
  if (!b || b.length < 4) return '';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'xlsx';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'xls';
  return '';
}

// READ | READING | STUCK | FAILED | WAITING, for the screen to act on.
export function receiptState(r, nowMs = Date.now()) {
  if (r?.aiStatus === 'READ') return 'READ';
  if (r?.aiStatus === 'FAILED') return 'FAILED';
  if (r?.aiStatus === 'READING') {
    const at = new Date(r.updatedAt).getTime();
    return Number.isFinite(at) && nowMs - at < READ_STUCK_MS ? 'READING' : 'STUCK';
  }
  return 'WAITING';
}

export const UNREADABLE_MESSAGE = 'We could not read this receipt. The photo may be blurry or it may not be a receipt. It is saved. Type the numbers by hand or take a new photo. (RECEIPT_UNREADABLE)';

function validDay(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

// What the AI answered, kept only where it is sound. A bad amount becomes
// blank, never a number somebody has to catch.
export function parseReceiptReply(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, message: UNREADABLE_MESSAGE };
  let raw;
  try {
    raw = JSON.parse(s.slice(start, end + 1));
  } catch {
    return { ok: false, message: UNREADABLE_MESSAGE };
  }
  const total = typeof raw.total === 'string' ? Number(raw.total.replace(/[$,\s]/g, '')) : raw.total;
  const amountCents = typeof total === 'number' && Number.isFinite(total) && total > 0
    ? Math.round(cents(total) * 100)
    : null;
  const vendor = typeof raw.vendor === 'string'
    ? raw.vendor.replace(/\s*[–—]\s*/g, ' ').trim().slice(0, 120) || null
    : null;
  const spentOn = validDay(raw.date);
  const category = EXPENSE_CATEGORY_KEYS.includes(raw.category) ? raw.category : null;
  if (!vendor && amountCents === null && !spentOn) return { ok: false, message: UNREADABLE_MESSAGE };
  return { ok: true, vendor, amountCents, spentOn, category };
}

export function receiptReadFailure(e) {
  const status = e?.status ?? null;
  const saved = 'The receipt is saved.';
  if (/credit balance/i.test(e?.message ?? '')) {
    return `Our receipt reader is switched off because the AI account is out of credit. This is on our side, not the receipt. ${saved} Add credit, then press Try again, or type the numbers by hand. (RECEIPT_READ_CREDIT)`;
  }
  if (status === 401 || status === 403) {
    return `Our receipt reader could not sign in to the AI service. This is on our side, not the receipt. ${saved} Check the AI key on Admin, then press Try again, or type the numbers by hand. (RECEIPT_READ_${status})`;
  }
  if (status === 429 || status >= 500) {
    return `The AI service is busy or having trouble. This is on their side, not the receipt. ${saved} Wait a minute, then press Try again. (RECEIPT_READ_${status})`;
  }
  if (status) {
    return `The AI service would not take this file as it is. ${saved} Press Try again once. If it fails again, type the numbers by hand. (RECEIPT_READ_${status})`;
  }
  return `The AI service did not answer. This is on our side or theirs, not the receipt. ${saved} Press Try again, or type the numbers by hand. (RECEIPT_READ_NO_ANSWER)`;
}
