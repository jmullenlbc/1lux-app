import { getAnthropicKey } from '@/lib/anthropicKey';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET(request) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const apiKey = getAnthropicKey()?.trim();
  if (!apiKey) return NextResponse.json({ error: 'No API key set' }, { status: 500 });

  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
