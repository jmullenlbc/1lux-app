import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { whoseLibrary } from '@/lib/tone/voiceApi';
import { templateSuggestions, templateVariables } from '@/lib/tone/library';

// PATCH /api/sales/voice/templates/[id]  { action: 'save' | 'dismiss' | 'restore' }
// A template suggestion from the Voice screen (Mike 9-27). Save copies it into
// the email templates (MessageTemplate); "Not useful" puts it away; restore
// brings it back. Nothing is deleted.
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth(request);
  if (error) return error;
  const row = await prisma.voiceTemplateSuggestion.findUnique({ where: { id: params.id }, include: { user: { select: { name: true } } } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const who = whoseLibrary(user, row.userId);
  if (who.error) return who.error;

  const { action } = await request.json().catch(() => ({}));
  const decided = { decidedById: user.id, decidedAt: new Date() };
  if (action === 'save') {
    if (row.status === 'SAVED' && row.messageTemplateId) return NextResponse.json({ templates: await templateSuggestions(row.userId) });
    const tpl = await prisma.messageTemplate.create({
      data: {
        name: row.name, channel: 'EMAIL', scenario: 'custom',
        subject: row.subject || null, body: row.body,
        direction: `Written from ${row.user?.name || 'a salesperson'}'s own emails (${row.basedOn} like it). ${row.whenToUse}`.trim(),
        variables: JSON.stringify(templateVariables(`${row.subject}\n${row.body}`)),
        createdById: user.id,
      },
    });
    await prisma.voiceTemplateSuggestion.update({ where: { id: row.id }, data: { status: 'SAVED', messageTemplateId: tpl.id, ...decided } });
  } else if (action === 'dismiss') {
    if (row.status === 'SAVED') return NextResponse.json({ error: 'Already saved to email templates. Archive it there instead.' }, { status: 409 });
    await prisma.voiceTemplateSuggestion.update({ where: { id: row.id }, data: { status: 'DISMISSED', ...decided } });
  } else if (action === 'restore') {
    if (row.status !== 'DISMISSED') return NextResponse.json({ error: 'Only a "not useful" suggestion can be brought back.' }, { status: 409 });
    await prisma.voiceTemplateSuggestion.update({ where: { id: row.id }, data: { status: 'SUGGESTED', ...decided } });
  } else {
    return NextResponse.json({ error: 'action must be save, dismiss or restore' }, { status: 400 });
  }
  return NextResponse.json({ templates: await templateSuggestions(row.userId) });
}
