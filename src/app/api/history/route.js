import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { historyFor } from '@/lib/recordHistory';

const TYPES = ['SALES_REP', 'MANUFACTURER', 'OUR_OFFICE', 'RFQ'];

// GET /api/history?type=SALES_REP&id=... the History card at the bottom of a record.
export async function GET(request) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  if (!TYPES.includes(type) || !id) {
    return NextResponse.json({ error: 'This history link is missing which record to show. Nothing was changed. Reload the page. (HISTORY_BAD_LINK)' }, { status: 400 });
  }
  return NextResponse.json({ history: await historyFor(type, id) });
}
