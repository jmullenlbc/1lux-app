import fs from 'fs';
import path from 'path';
import { createId } from '@paralleldrive/cuid2';

const QC_DIR = path.join(process.cwd(), 'uploads', 'qc');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export async function putQcObject(buffer, { ext = 'png' } = {}) {
  ensureDir(QC_DIR);
  const filename = `${createId()}.${ext}`;
  const filepath = path.join(QC_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return `qc/${filename}`;
}

export async function getQcObjectUrl(key) {
  return `/api/qc/media?key=${encodeURIComponent(key)}`;
}
