import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { signPortalToken, setPortalSessionCookie } from '@/lib/portalAuth';

/**
 * GET /api/portal/invite/[token]
 * Validate an invite token and return contact + project info.
 */
export async function GET(req, { params }) {
  const contact = await prisma.projectExternalContact.findUnique({
    where:   { inviteToken: params.token },
    include: { project: { select: { id: true, name: true } } },
  });

  if (!contact) {
    return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
  }

  if (contact.acceptedAt) {
    return NextResponse.json({ error: 'Invitation already accepted', alreadyAccepted: true }, { status: 409 });
  }

  if (contact.inviteTokenExpiresAt && new Date(contact.inviteTokenExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'Invite link has expired. Ask your ILC project manager to resend.' }, { status: 410 });
  }

  return NextResponse.json({
    contact: { name: contact.name, email: contact.email, role: contact.role },
    project: contact.project,
  });
}

/**
 * POST /api/portal/invite/[token]
 * Accept the invite: create or update PortalUser, link to contact, set session cookie.
 * Body: { password, name? }
 */
export async function POST(req, { params }) {
  const contact = await prisma.projectExternalContact.findUnique({
    where:   { inviteToken: params.token },
    include: { project: { select: { id: true, name: true } } },
  });

  if (!contact)              return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
  if (contact.acceptedAt)    return NextResponse.json({ error: 'Already accepted' }, { status: 409 });
  if (contact.inviteTokenExpiresAt && new Date(contact.inviteTokenExpiresAt) < new Date()) {
    return NextResponse.json({ error: 'Invite link expired' }, { status: 410 });
  }

  const body = await req.json();
  const { password, name } = body;

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const displayName  = name?.trim() || contact.name;

  // Upsert PortalUser (email may already exist if contact was added to multiple projects)
  let portalUser = await prisma.portalUser.findUnique({ where: { email: contact.email } });

  if (portalUser) {
    portalUser = await prisma.portalUser.update({
      where: { email: contact.email },
      data:  { name: displayName, passwordHash },
    });
  } else {
    portalUser = await prisma.portalUser.create({
      data: { email: contact.email, name: displayName, passwordHash, role: 'EXTERNAL' },
    });
  }

  // Link contact to portal user and mark as accepted
  await prisma.projectExternalContact.update({
    where: { id: contact.id },
    data:  {
      portalUserId: portalUser.id,
      acceptedAt:   new Date(),
      inviteToken:  null,          // consume token
      inviteTokenExpiresAt: null,
    },
  });

  const token    = await signPortalToken({ portalUserId: portalUser.id, email: portalUser.email, name: portalUser.name });
  const response = NextResponse.json({ success: true, projectId: contact.project_id });
  setPortalSessionCookie(response, token);
  return response;
}
