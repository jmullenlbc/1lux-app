import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/crm/deals/[id]/activities
// Body: { type, body }
// type: NOTE | CALL | EMAIL | MEETING
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const deal = await prisma.deal.findUnique({ where: { id: params.id } });
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { type = 'NOTE', body: bodyText } = await request.json();
  if (!bodyText?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 });

  const VALID_TYPES = ['NOTE', 'CALL', 'EMAIL', 'MEETING'];
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }

  const activity = await prisma.dealActivity.create({
    data: {
      dealId:   deal.id,
      userId:   user.id,
      userName: user.name || user.email,
      type,
      body:     bodyText.trim(),
    },
  });

  return NextResponse.json(activity, { status: 201 });
}
