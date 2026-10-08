import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { pollAllPermits } from '@/lib/market-intel/permits';

/**
 * POST /api/market-intel/permits/poll
 * Pull every active city permit feed now (0123). Same access rule as the news
 * poll: any staff member or the cron secret. The daily news poll also runs
 * this, so the button is for "I want to see it now".
 */
export async function POST(request) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron     = cronSecret && request.headers.get('x-cron-secret') === cronSecret;
  if (!isCron) {
    const user = await getSession();
    if (!user || user.role === 'CLIENT_VIEWER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // 22 s of work per press keeps every slice under the ~30 s Amplify wall.
    const { logs, more } = await pollAllPermits({ deadline: Date.now() + 22000 });
    return NextResponse.json({ ok: true, logs, more });
  } catch (err) {
    console.error('[market-intel/permits/poll]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
