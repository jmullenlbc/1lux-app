import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getPublicBudgetPassword, setPublicBudgetPassword } from '@/lib/publicAccess';

export const dynamic = 'force-dynamic';

/**
 * Admins read and change the password on the public /conceptual_budget tool.
 * GET  -> { password }           (empty string = the tool is open to everyone)
 * PUT  { password } -> { ok }    (empty clears it; everyone is signed out at once)
 */
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  return NextResponse.json({ password: await getPublicBudgetPassword() });
}

export async function PUT(request) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const password = String(body?.password ?? '').trim();
  if (password.length > 100) {
    return NextResponse.json({ error: 'Keep the password under 100 characters.' }, { status: 400 });
  }
  await setPublicBudgetPassword(password, user.id);
  return NextResponse.json({ ok: true, password });
}
