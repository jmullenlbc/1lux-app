import { NextResponse } from 'next/server';

function verifyCronSecret(req) {
  const secret = req.headers.get('x-cron-secret');
  return secret === process.env.CRON_SECRET;
}

export async function POST(req) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Queue processing not yet active: Phase B',
    processed: 0,
  });
}
