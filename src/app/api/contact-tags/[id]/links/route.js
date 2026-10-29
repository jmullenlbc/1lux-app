import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST /api/contact-tags/[id]/links  { contactIds: [...], remove?: true }
// Bulk tag (or un-tag) the people checked on the Contacts list.
export async function POST(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const tag = await prisma.contactTag.findUnique({ where: { id: params.id } });
  if (!tag) return NextResponse.json({ error: 'That tag is gone, someone may have deleted it. Nothing was changed. Reload the page. (TAG_NOT_FOUND)' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(body.contactIds) ? body.contactIds : []).map(String))].slice(0, 5000);
  if (!ids.length) return NextResponse.json({ error: 'Check at least one person first. Nothing was changed. (NO_PEOPLE_PICKED)' }, { status: 400 });

  if (body.remove) {
    const r = await prisma.contactTagLink.deleteMany({ where: { tagId: tag.id, contactId: { in: ids } } });
    return NextResponse.json({ ok: true, removed: r.count });
  }
  const real = await prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const have = new Set((await prisma.contactTagLink.findMany({ where: { tagId: tag.id, contactId: { in: ids } }, select: { contactId: true } })).map(l => l.contactId));
  const add = real.map(c => c.id).filter(id => !have.has(id));
  // createMany skipDuplicates is Postgres-only; the filter above does the same job on sqlite.
  if (add.length) await prisma.contactTagLink.createMany({ data: add.map(contactId => ({ contactId, tagId: tag.id })) });
  return NextResponse.json({ ok: true, added: add.length });
}
