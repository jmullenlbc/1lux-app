import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { isSheetKey, presignSheetRead } from '@/lib/uploadStorage';

export const dynamic = 'force-dynamic';

/**
 * Hand a logged-in reviewer a short-lived link to one kept sheet.
 *
 * These are drawings a general contractor sent us. They are not public, they
 * are not shared, and nothing about them should be reachable by guessing a URL
 * so the bucket stays private and the only way to see a sheet is through
 * here, behind the same admin gate as the review queue itself.
 *
 * The link expires in five minutes. It is re-issued every time the reviewer
 * opens the submission, so a short life costs nothing and means a link that
 * leaks out of a browser history or a pasted message is already dead.
 */
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const key = new URL(request.url).searchParams.get('key');
  // Checked before it reaches storage: `key` arrives from a submission payload,
  // which a member of the public wrote. isSheetKey is what stands between that
  // and an arbitrary object name.
  if (!isSheetKey(key)) {
    return NextResponse.json({ error: 'Not a valid sheet reference.' }, { status: 400 });
  }

  const url = await presignSheetRead(key);
  if (!url) {
    return NextResponse.json({ error: 'That sheet is no longer available.' }, { status: 404 });
  }
  return NextResponse.json({ url });
}
