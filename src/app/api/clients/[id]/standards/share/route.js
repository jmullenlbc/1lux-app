import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';

function shareUrlFor(token) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/share/standards/${token}`;
}

async function authorize(clientId) {
  const { user, error } = await requireAuth();
  if (error) return { error };
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canSeeAllData(user) && client.createdById !== user.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, client };
}

// POST, get-or-create the persistent, live-updating standards share link for this client
export async function POST(request, { params }) {
  const { user, error } = await authorize(params.id);
  if (error) return error;

  let share = await prisma.clientStandardsShare.findUnique({ where: { clientId: params.id } });
  if (!share) {
    share = await prisma.clientStandardsShare.create({
      data: { clientId: params.id, createdById: user.id },
    });
  }

  return NextResponse.json({ share, shareUrl: shareUrlFor(share.token) }, { status: 200 });
}

// GET, return the existing link (if any) without creating one
export async function GET(request, { params }) {
  const { error } = await authorize(params.id);
  if (error) return error;

  const share = await prisma.clientStandardsShare.findUnique({ where: { clientId: params.id } });
  return NextResponse.json({ share, shareUrl: share ? shareUrlFor(share.token) : null });
}

// DELETE, revoke the link (rotates by removing it; a new POST mints a fresh token)
export async function DELETE(request, { params }) {
  const { error } = await authorize(params.id);
  if (error) return error;

  await prisma.clientStandardsShare.deleteMany({ where: { clientId: params.id } });
  return NextResponse.json({ ok: true });
}
