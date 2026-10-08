import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runPoll } from '@/lib/market-intel/poller';

export async function POST(request) {
  // Any signed-in staff member (Mike 10-6: "all staff"), or a valid cron secret.
  // Client viewers never see the Market Intel pages, so they are kept out here too.
  const cronSecret = process.env.CRON_SECRET;
  const cronHeader = request.headers.get('x-cron-secret');
  const isCron     = cronSecret && cronHeader === cronSecret;

  if (!isCron) {
    const user = await getSession();
    if (!user || user.role === 'CLIENT_VIEWER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // 22 s of work per press keeps every slice under the ~30 s Amplify wall.
    const log = await runPoll({ deadline: Date.now() + 22000 });
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    console.error('[market-intel/poll]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
