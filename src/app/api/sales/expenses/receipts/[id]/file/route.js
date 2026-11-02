import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireStaff, canSeeAllData } from '@/lib/auth';
import { getSalesDocObject, presignSalesDocDownload } from '@/lib/salesDocs/storage';

export const runtime = 'nodejs';

// GET  the receipt itself. Pictures and PDFs open in the tab, Excel downloads.
// Goes through this cookie checked route because the bucket only takes PUTs
// from the browser.
export async function GET(request, { params }) {
  const { user, error } = await requireStaff(request);
  if (error) return error;
  const r = await prisma.expenseReceipt.findUnique({
    where: { id: params.id },
    select: { userId: true, storedKey: true, fileName: true, mimeType: true },
  });
  if (!r || (r.userId !== user.id && !canSeeAllData(user))) {
    return NextResponse.json({ error: 'That receipt could not be found.' }, { status: 404 });
  }
  const disposition = /^image\/|pdf$/.test(r.mimeType) ? 'inline' : 'attachment';
  const url = await presignSalesDocDownload(r.storedKey, r.fileName, disposition);
  if (url) return NextResponse.redirect(url, 302);
  const buf = await getSalesDocObject(r.storedKey);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': r.mimeType,
      'Content-Disposition': `${disposition}; filename="${r.fileName.replace(/["\\\r\n]/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
