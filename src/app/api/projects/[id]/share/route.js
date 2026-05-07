import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST — create a share link and (eventually) send emails
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { emails = [], message = '' } = await request.json();

  const share = await prisma.projectShare.create({
    data: {
      projectId: params.id,
      sentById:  user.id,
      sentTo:    JSON.stringify(emails.filter(Boolean)),
      message:   message || null,
    },
  });

  // Mark project as SENT
  await prisma.project.update({
    where: { id: params.id },
    data:  { status: 'SENT' },
  });

  // TODO: wire up an email provider (Resend / SendGrid / Postmark) here.
  // The share token and link are ready — just need to call the email API.
  // Example with Resend:
  //   await resend.emails.send({ from: 'budgets@ilcstudios.com', to: emails,
  //     subject: `Lighting Budget: ${project.name}`, html: buildEmailHtml(share) })

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/share/${share.token}`;

  return NextResponse.json({ share, shareUrl }, { status: 201 });
}

// GET — list shares for this project
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ILC_ADMIN' && project.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const shares = await prisma.projectShare.findMany({
    where:   { projectId: params.id },
    orderBy: { sentAt: 'desc' },
  });

  return NextResponse.json({ shares });
}
