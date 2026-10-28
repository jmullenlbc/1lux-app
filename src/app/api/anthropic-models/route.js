import { getAnthropicKey } from '@/lib/anthropicKey';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const apiKey = (await getAnthropicKey())?.trim();
  if (!apiKey) return NextResponse.json({ error: 'No API key set' }, { status: 500 });

  // Deliberately NOT recorded in the agent ledger. This is `/v1/models`, a
  // metadata listing, not a model run. It consumes no tokens and produces no
  // completion, so a ledger entry for it would be a zero-token row diluting
  // every per-task average it landed in. The ledger records inference, not
  // every request that happens to reach api.anthropic.com.
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
