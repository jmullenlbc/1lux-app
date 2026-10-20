import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { loadLink, requirePass, docOnLink, ipHashOf } from '@/lib/salesDocs/share';
import { isForwarded } from '@/lib/salesDocs/matching';
import { deviceFromUa } from '@/lib/salesDocs/tracking';
import { onSalesDocEvent } from '@/lib/salesDocs/events';

export const runtime = 'nodejs';

// POST /api/share/docs/[token]/views  { docId }
// One visit to one document. The only place a view is made.
export async function POST(request, { params }) {
  const link = await loadLink(params.token);
  const pass = await requirePass(link);
  if (!pass) return NextResponse.json({ error: 'Open the link again.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const doc = docOnLink(link, String(body.docId || ''));
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const visitor = await prisma.salesDocVisitor.findUnique({ where: { id: pass.visitorId } });
  if (!visitor) return NextResponse.json({ error: 'Open the link again.' }, { status: 401 });

  const now = new Date();
  const forwarded = isForwarded(link.recipientEmail, visitor.email);
  const { device, browser } = deviceFromUa(request.headers.get('user-agent'));
  const ipHash = ipHashOf(request);
  const view = await prisma.salesDocView.create({
    data: {
      linkId: link.id, visitorId: visitor.id, docId: doc.id, versionId: doc.currentVersion.id,
      isForwarded: forwarded, startedAt: now, lastPingAt: now, durationMs: 0, device, browser, ipHash,
    },
  });
  const firstOpen = !link.firstOpenedAt;
  await prisma.$transaction([
    prisma.salesDocEvent.create({ data: { type: 'OPENED', linkId: link.id, viewId: view.id, visitorId: visitor.id, docId: doc.id, email: visitor.email, ipHash } }),
    prisma.salesDocVisitor.update({ where: { id: visitor.id }, data: { lastSeenAt: now } }),
    ...(firstOpen ? [prisma.salesDocLink.update({ where: { id: link.id }, data: { firstOpenedAt: now } })] : []),
  ]);

  // Alerts never block the viewer.
  try {
    if (firstOpen) await onSalesDocEvent('OPENED', { link, visitor, docTitle: doc.title, viewId: view.id });
    if (forwarded) {
      await prisma.salesDocEvent.create({ data: { type: 'FORWARDED', linkId: link.id, viewId: view.id, visitorId: visitor.id, docId: doc.id, email: visitor.email, ipHash } });
      await onSalesDocEvent('FORWARDED', { link, visitor, docTitle: doc.title, viewId: view.id });
    }
  } catch { /* the bell can miss one; the view stands */ }

  return NextResponse.json({ viewId: view.id }, { status: 201 });
}
