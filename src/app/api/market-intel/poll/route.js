import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runPoll } from '@/lib/market-intel/poller';

export async function POST(request) {
  // Allow ILC admins or a valid cron secret
  const cronSecret = process.env.CRON_SECRET;
  const cronHeader = request.headers.get('x-cron-secret');
  const isCron     = cronSecret && cronHeader === cronSecret;

  if (!isCron) {
    const session = await getSession();
    if (!user || (user.role !== 'ILC_ADMIN' && user.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const log = await runPoll();
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    console.error('[market-intel/poll]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
