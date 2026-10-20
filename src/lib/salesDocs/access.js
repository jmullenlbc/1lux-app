// Who may use the Sales Docs staff screens and APIs (0137): every staff login
// except External Client Viewers, who are contractors and must never reach a
// price sheet before it has been cleared for them.
import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';

export async function requireSalesDocsUser() {
  const { user, error } = await requireAuth();
  if (error) return { user: null, error };
  if (!canSeeAllData(user)) {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, error: null };
}

export const badRequest = (message, status = 400) => NextResponse.json({ error: message }, { status });

/** pdf or xlsx from a file name; null for anything else. */
export function kindFromName(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'PDF';
  if (ext === 'xlsx') return 'XLSX';
  return null;
}

export const MIME = { PDF: 'application/pdf', XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

/** File name without its extension, for a default title. */
export const titleFromName = (name) => String(name || 'Document').replace(/\.[^.]+$/, '').slice(0, 200) || 'Document';
