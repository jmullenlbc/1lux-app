import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

// Retired 2026-09-14. This old invite screen could only create a "User" or the
// old "Admin" name, never a Client Viewer, and nothing in the app calls it
// any more. People are added from Admin → Users (POST /api/admin/users).
// Invites it already sent still work: /register reads the invite token.
function retired() {
  return NextResponse.json(
    { error: 'This invite screen was retired. Add people from Admin → Users.' },
    { status: 410 },
  );
}

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;
  return retired();
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return retired();
}
