import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SALES_DOCS_BRAND } from '@/lib/salesDocsBrand';
import { loadLink, linkState, linkDocs, publicDoc, requirePass, ipHashOf } from '@/lib/salesDocs/share';

export const runtime = 'nodejs';

const HIT_EVENT = { REVOKED: 'REVOKED_HIT', EXPIRED: 'EXPIRED_HIT', ARCHIVED: 'EXPIRED_HIT' };

// GET /api/share/docs/[token]: what the public page needs before it draws.
// The doc list comes back only once the visitor holds a pass for this link.
// Opening this does not count as a view; POST /views does that.
export async function GET(request, { params }) {
  const link = await loadLink(params.token);
  const state = linkState(link);
  if (state !== 'OK') {
    if (link && HIT_EVENT[state]) {
      await prisma.salesDocEvent.create({
        data: { type: HIT_EVENT[state], linkId: link.id, docId: link.docId || null, ipHash: ipHashOf(request) },
      }).catch(() => {});
    }
    return NextResponse.json({ state, brand: SALES_DOCS_BRAND }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  const pass = await requirePass(link);
  const body = {
    state,
    brand: SALES_DOCS_BRAND,
    link: {
      name: link.name,
      requireEmail: link.requireEmail,
      needsPassword: !!link.passwordHash,
      allowDownload: link.allowDownload,
      isSpace: !!link.spaceId,
    },
    passed: !!pass,
  };
  if (pass) {
    body.docs = linkDocs(link).map(publicDoc);
    if (link.space) body.space = { name: link.space.name, description: link.space.description };
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
