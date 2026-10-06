import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { quickContact } from '@/lib/crm/quickContact';

export const dynamic = 'force-dynamic';

// POST /api/crm/contacts/quick  { email, name?, clientId? }
// One button: find the person by email or make them, guessing the company
// from the email domain when none is given (0118).
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  try {
    const result = await quickContact(prisma, {
      email: body?.email, name: body?.name || null, clientId: body?.clientId || null, ownerId: user.id, createdById: user.id,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Could not add the person.' }, { status: 400 });
  }
}
