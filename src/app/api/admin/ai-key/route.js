import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { anthropicKeyStatus, saveAnthropicKey, checkAnthropicKey, getAnthropicKey } from '@/lib/anthropicKey';

export const dynamic = 'force-dynamic';

/**
 * The AI key, changed from Admin instead of AWS (Mike 10-28, after Sean left).
 * Super admins only. The key never comes back out of this route, not even in part.
 *
 * GET               -> { source, savedAt, savedBy, unreadable, working, status }
 * PUT { key }       -> tests the key with Anthropic first; saves only if it works
 * PUT { key: '' }   -> removes the saved key; the server's own key is used again
 */
export async function GET(request) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;
  const status = await anthropicKeyStatus();
  const check = await checkAnthropicKey(await getAnthropicKey());
  return NextResponse.json({ ...status, working: check.ok, status: check.status });
}

export async function PUT(request) {
  const { user, error } = await requireSuperAdmin(request);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'The request was not readable. Nothing was saved. Reload the page and try again. (AIKEY-400)' }, { status: 400 });
  }
  const key = String(body?.key ?? '').trim();
  if (key.length > 300) {
    return NextResponse.json({ error: 'That is longer than any Anthropic key. Nothing was saved. Copy the key again from the Anthropic console. (AIKEY-LEN)' }, { status: 400 });
  }
  if (key) {
    const check = await checkAnthropicKey(key);
    if (!check.ok) {
      const why = check.status === 401 ? 'Anthropic says this key is not valid (it may be revoked or mistyped).'
        : check.status === 0 ? 'We could not reach Anthropic to test it.'
        : `Anthropic answered with an error (${check.status}).`;
      return NextResponse.json({ error: `${why} Nothing was saved; the old key is still in use. Copy the key again from the Anthropic console and retry. (AIKEY-${check.status || 'NET'})` }, { status: 400 });
    }
  }
  await saveAnthropicKey(key, user.id);
  return NextResponse.json({ ok: true, ...(await anthropicKeyStatus()) });
}
