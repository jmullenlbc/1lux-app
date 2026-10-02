import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ruleFields } from '@/lib/bot/templateRules';

export async function PATCH(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = params;

  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const body = await req.json();
  const { name, channel, scenario, dealStage, clientType, subject, body: templateBody, direction, variables, isDefault, isActive } = body;

  const updated = await prisma.messageTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(channel !== undefined && { channel }),
      ...(scenario !== undefined && { scenario }),
      ...(dealStage !== undefined && { dealStage }),
      ...(clientType !== undefined && { clientType }),
      ...ruleFields(body, true),
      ...(subject !== undefined && { subject }),
      ...(templateBody !== undefined && { body: templateBody }),
      ...(direction !== undefined && { direction: direction || null }),
      ...(variables !== undefined && { variables }),
      ...(isDefault !== undefined && { isDefault }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json({ template: updated });
}

// Email templates are archived, never deleted. Mike, 2026-09-11: "Do it for
// email templates in the CRM definitely." Archiving (PATCH isActive: false)
// takes a template out of everything that picks one, and keeps it.
//
// Kept as a refusal rather than removed, like the bot-knowledge routes, so an
// old open tab or anything written later cannot destroy a template by calling a
// URL the screen no longer uses.
export async function DELETE() {
  return NextResponse.json(
    { error: 'Email templates are archived, never deleted. Archive it instead — it stops being used and is kept.' },
    { status: 405 },
  );
}
