// GET /api/crm/contacts/created-by-month
// How many people were added to the CRM each month, last 12 months, by who
// added them. Returns [{ month: 'YYYY-MM', userId, count }]; userId is null
// for people added before migration 0119 and for web visitors, so those rows
// count only in the team total.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const rows = await prisma.contact.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true, createdById: true },
  });

  const counts = new Map(); // "YYYY-MM|userId" -> count
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const key = `${month}|${r.createdById || ''}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const out = [...counts.entries()].map(([key, count]) => {
    const [month, userId] = key.split('|');
    return { month, userId: userId || null, count };
  });
  out.sort((a, b) => a.month.localeCompare(b.month));
  return NextResponse.json(out);
}
