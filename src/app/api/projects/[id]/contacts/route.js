import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { randomUUID } from 'crypto';
import { portalInvite } from '@/lib/emailTemplates';
import { brandForProject } from '@/lib/brandServer';

async function canAccess(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return null;
  if (!canSeeAllData(user) && p.createdById !== user.id) return null;
  return p;
}

async function sendInviteEmail({ to, contactName, projectName, token, projectId }) {
  if (process.env.NOTIFY_DRY_RUN !== 'false') {
    console.log(`[INVITE DRY RUN] to=${to} token=${token}`);
    return;
  }
  const inviteUrl        = `${process.env.APP_URL || ''}/portal/invite/${token}`;
  const { subject, html } = portalInvite({ projectName, inviteUrl, contactName, brandName: (await brandForProject(projectId)).name });
  console.log(`[INVITE] Sending to=${to} subject="${subject}"`);
  // TODO: Microsoft Graph API sendMail
}

/**
 * GET /api/projects/[id]/contacts
 * Returns all ProjectExternalContact records for this project.
 */
export async function GET(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const project = await canAccess(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contacts = await prisma.projectExternalContact.findMany({
    where:   { project_id: params.id },
    orderBy: { createdAt: 'asc' },
    include: { portalUser: { select: { id: true, email: true, name: true, createdAt: true } } },
  });

  return NextResponse.json({ contacts });
}

/**
 * POST /api/projects/[id]/contacts
 * Create a new external contact and send an invite email.
 * Body: { name, email, role, canViewShipSchedule, canViewSubmittals, ... }
 */
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const project = await canAccess(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const {
    name,
    email,
    role                  = 'Contractor',
    canViewShipSchedule      = false,
    canViewSubmittals        = false,
    canViewMeetings          = false,
    canViewContracts         = false,
    canViewConstructionSched = false,
    canViewChangeOrders      = false,
    canViewBudgets           = false,
    canApproveChangeOrders   = false,
  } = body;

  if (!name || !email) {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 });
  }

  const inviteToken          = randomUUID();
  const inviteTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const contact = await prisma.projectExternalContact.create({
    data: {
      project_id:              params.id,
      name,
      email,
      role,
      canViewShipSchedule,
      canViewSubmittals,
      canViewMeetings,
      canViewContracts,
      canViewConstructionSched,
      canViewChangeOrders,
      canViewBudgets,
      canApproveChangeOrders,
      inviteToken,
      inviteTokenExpiresAt,
      invitedAt:               new Date(),
    },
  });

  // Fire invite email (dry-run safe)
  await sendInviteEmail({ to: email, contactName: name, projectName: project.name, token: inviteToken, projectId: params.id });

  return NextResponse.json({ contact }, { status: 201 });
}
