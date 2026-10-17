import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { randomUUID } from 'crypto';
import { portalInvite } from '@/lib/emailTemplates';

/**
 * POST /api/projects/[id]/contacts/[contactId]/invite
 * Regenerate invite token and resend invite email.
 */
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canSeeAllData(user) && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const contact = await prisma.projectExternalContact.findFirst({
    where: { id: params.contactId, project_id: params.id },
  });
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  // Already accepted, don't re-invite
  if (contact.acceptedAt) {
    return NextResponse.json({ error: 'Contact has already accepted the invitation' }, { status: 409 });
  }

  const inviteToken          = randomUUID();
  const inviteTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.projectExternalContact.update({
    where: { id: params.contactId },
    data:  { inviteToken, inviteTokenExpiresAt, invitedAt: new Date() },
  });

  if (process.env.NOTIFY_DRY_RUN !== 'false') {
    console.log(`[INVITE DRY RUN] Resent to=${contact.email} token=${inviteToken}`);
  } else {
    const inviteUrl         = `${process.env.APP_URL || ''}/portal/invite/${inviteToken}`;
    const { subject, html } = portalInvite({ projectName: project.name, inviteUrl, contactName: contact.name });
    console.log(`[INVITE] Resending to=${contact.email} subject="${subject}"`);
    // TODO: Microsoft Graph API sendMail
  }

  return NextResponse.json({ success: true, invitedAt: new Date() });
}
