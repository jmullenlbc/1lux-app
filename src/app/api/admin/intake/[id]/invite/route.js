import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { randomUUID } from 'crypto';
import { portalInvite } from '@/lib/emailTemplates';
import { brandForProject } from '@/lib/brandServer';

export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const submission = await prisma.conceptualSubmission.findUnique({
    where: { id: params.id },
    include: { duplicateMatch: { select: { id: true, name: true } } },
  });
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!submission.duplicateMatchId)
    return NextResponse.json({ error: 'Link a project to this submission first' }, { status: 400 });

  const project = submission.duplicateMatch;

  // Check if a contact record already exists for this email on this project
  const existing = await prisma.projectExternalContact.findFirst({
    where: { project_id: project.id, email: submission.submitterEmail },
  });

  let contact;
  let alreadyAccepted = false;

  if (existing) {
    if (existing.acceptedAt) {
      alreadyAccepted = true;
      contact = existing;
    } else {
      // Regenerate token for resend
      const inviteToken = randomUUID();
      contact = await prisma.projectExternalContact.update({
        where: { id: existing.id },
        data: {
          inviteToken,
          inviteTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invitedAt: new Date(),
        },
      });
    }
  } else {
    const inviteToken = randomUUID();
    contact = await prisma.projectExternalContact.create({
      data: {
        project_id:           project.id,
        name:                 submission.submitterName,
        email:                submission.submitterEmail,
        role:                 'Client',
        canViewBudgets:       true,
        inviteToken,
        inviteTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedAt:            new Date(),
      },
    });
  }

  const appUrl    = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  const inviteUrl = alreadyAccepted ? null : `${appUrl}/portal/invite/${contact.inviteToken}`;

  if (!alreadyAccepted) {
    if (process.env.NOTIFY_DRY_RUN !== 'false') {
      console.log(`[INVITE DRY RUN] to=${submission.submitterEmail} url=${inviteUrl}`);
    } else {
      const { subject, html } = portalInvite({
        projectName: project.name,
        inviteUrl,
        contactName: submission.submitterName,
        brandName:   (await brandForProject(project)).name,
      });
      console.log(`[INVITE] Sending to=${submission.submitterEmail} subject="${subject}"`);
      // TODO: Microsoft Graph API sendMail
    }
  }

  return NextResponse.json({
    success:        true,
    alreadyAccepted,
    inviteUrl,
    submitterEmail: submission.submitterEmail,
  });
}