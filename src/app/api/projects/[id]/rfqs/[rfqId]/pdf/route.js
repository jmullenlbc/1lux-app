import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf';
import { rfqFooter, rfqPdfHtml } from '@/lib/rfq/pdfHtml';
import { pdfFileName } from '@/lib/rfq/format';
import { changesFor } from '@/lib/rfq/resolve';
import { brandForProject } from '@/lib/brandServer';

// GET the RFQ as a PDF, Trackvia layout (0144). Registered in next.config.mjs
// outputFileTracingIncludes so Chromium ships with this route.
export async function GET(request, { params }) {
  const { error } = await requireStaff(request);
  if (error) return error;
  const rfq = await prisma.rfq.findFirst({
    where: { id: params.rfqId, projectId: params.id },
    include: { lines: { orderBy: { sortOrder: 'asc' } }, office: true, project: { select: { name: true, preconManager: { select: { name: true } } } } },
  });
  if (!rfq) return NextResponse.json({ error: 'That RFQ is not in the app any more. Nothing was made. Reload the page. (RFQ_NOT_FOUND)' }, { status: 404 });
  try {
    const brand = await brandForProject(params.id);
    const html = rfqPdfHtml({ rfq, project: rfq.project, office: rfq.office, pmName: rfq.project.preconManager?.name, brand, changes: await changesFor(rfq) });
    const pdf = await htmlToPdf(html, { margin: { top: '0.5in', right: '0.5in', bottom: '0.6in', left: '0.5in' }, footer: rfqFooter(rfq) });
    const name = pdfFileName({ number: rfq.number, familyNumber: rfq.familyNumber, version: rfq.version, projectName: rfq.project.name, brand });
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${new URL(request.url).searchParams.get('download') ? 'attachment' : 'inline'}; filename="${name.replace(/"/g, '')}"`,
      },
    });
  } catch (e) {
    console.error('[rfq pdf]', e);
    return NextResponse.json({ error: 'The app could not make the RFQ PDF. This is on our side; the RFQ itself is saved. Try again in a minute. (RFQ_PDF_FAILED)' }, { status: 500 });
  }
}
