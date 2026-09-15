import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/projects/[id]/ship-schedule/email
// Body: { to, message? }
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { to, message } = body;
  if (!to?.trim()) return NextResponse.json({ error: 'recipients required' }, { status: 400 });

  const project = await prisma.project.findUnique({
    where:  { id: params.id },
    select: { name: true, city: true, state: true },
  });

  const pdfUrl   = `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/projects/${params.id}/ship-schedule/pdf`;
  const location = [project?.city, project?.state].filter(Boolean).join(', ');

  // This used to call sendNotification() with the wrong arguments, so no email
  // ever went out.
  try {
    const { sendEmail, escapeHtml } = await import('@/lib/notify');
    const recipients = to.split(',').map(e => e.trim()).filter(Boolean);
    for (const recipient of recipients) {
      await sendEmail({
        to:      recipient,
        subject: `Ship Schedule — ${project?.name || 'Project'}`,
        html: `
          <p>Please find the ship schedule for <strong>${escapeHtml(project?.name || 'the project')}${location ? ` (${escapeHtml(location)})` : ''}</strong>.</p>
          ${message ? `<p><em>${escapeHtml(message)}</em></p>` : ''}
          <p style="margin-top:16px">
            <a href="${pdfUrl}" style="background:#0f172a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
              View Ship Schedule PDF
            </a>
          </p>
          <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0"/>
          <p style="color:#94a3b8;font-size:12px">
            Sent by ${user.name || user.email} · ILC Studios
          </p>
        `,
      }).catch(() => {});
    }
  } catch {}

  return NextResponse.json({ ok: true, sentTo: to.trim() });
}
