import { NextResponse } from 'next/server';
import { clearPortalSessionCookie } from '@/lib/portalAuth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearPortalSessionCookie(response);
  return response;
}
