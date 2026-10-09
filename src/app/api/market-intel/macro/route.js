import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { pullMacroStats, macroSnapshot, macroStale } from '@/lib/market-intel/macroStats';

/**
 * GET  /api/market-intel/macro   the strip's numbers (pulls first when nothing has ever been pulled)
 * POST /api/market-intel/macro   pull FRED now, then answer like GET
 * Migration 0128. Any staff member; the daily cron also pulls when stale.
 */
export async function GET(request) {
  const { error } = await requireAuth(request);
  if (error) return error;
  try {
    let snap = await macroSnapshot();
    if (!snap.fetchedAt) {
      await pullMacroStats({ deadline: Date.now() + 15000 });
      snap = await macroSnapshot();
    }
    return NextResponse.json({ ok: true, ...snap, stale: await macroStale() });
  } catch (err) {
    console.error('[market-intel/macro]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  if (user?.role === 'CLIENT_VIEWER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const log  = await pullMacroStats({ deadline: Date.now() + 20000 });
    const snap = await macroSnapshot();
    return NextResponse.json({ ok: true, log, ...snap, stale: false });
  } catch (err) {
    console.error('[market-intel/macro]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
