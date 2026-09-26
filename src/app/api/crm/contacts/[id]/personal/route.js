import { NextResponse } from 'next/server';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cleanCategory, cleanFact, factKey } from '@/lib/contacts/personalFacts';

// Personal things a contact mentioned (kids, golf, cold brew). Staff only;
// archive-only: "put away" stamps archivedAt, restore clears it.

const SELECT = {
  id: true, category: true, fact: true, source: true, archivedAt: true, createdAt: true,
  sourceNote: { select: { id: true, title: true } },
  createdBy: { select: { name: true } },
};

async function guard(params) {
  const { user, error } = await requireAuth();
  if (error) return { error };
  if (isClientViewer(user.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const contact = await prisma.contact.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!contact) return { error: NextResponse.json({ error: 'Contact not found' }, { status: 404 }) };
  return { user };
}

const list = contactId => prisma.contactPersonalFact.findMany({
  where: { contactId }, orderBy: { createdAt: 'desc' }, select: SELECT,
});

export async function GET(request, { params }) {
  const { error } = await guard(params);
  if (error) return error;
  return NextResponse.json({ facts: await list(params.id) });
}

// POST { category, fact } — typed by hand.
export async function POST(request, { params }) {
  const { user, error } = await guard(params);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const fact = cleanFact(body.fact);
  if (fact.length < 2) return NextResponse.json({ error: 'Type what they mentioned.' }, { status: 400 });
  const existing = await prisma.contactPersonalFact.findMany({ where: { contactId: params.id, archivedAt: null }, select: { fact: true } });
  if (existing.some(f => factKey(f.fact) === factKey(fact))) {
    return NextResponse.json({ error: 'That is already on file.' }, { status: 409 });
  }
  await prisma.contactPersonalFact.create({
    data: { contactId: params.id, category: cleanCategory(body.category), fact, source: 'manual', createdById: user.id },
  });
  return NextResponse.json({ facts: await list(params.id) });
}

// PATCH { factId, archived?, fact?, category? }
export async function PATCH(request, { params }) {
  const { user, error } = await guard(params);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const row = body.factId && await prisma.contactPersonalFact.findFirst({ where: { id: body.factId, contactId: params.id } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const data = {};
  if (body.archived === true)  { data.archivedAt = new Date(); data.archivedById = user.id; }
  if (body.archived === false) { data.archivedAt = null; data.archivedById = null; }
  if (body.fact !== undefined) {
    const fact = cleanFact(body.fact);
    if (fact.length < 2) return NextResponse.json({ error: 'Type what they mentioned.' }, { status: 400 });
    data.fact = fact;
  }
  if (body.category !== undefined) data.category = cleanCategory(body.category);
  await prisma.contactPersonalFact.update({ where: { id: row.id }, data });
  return NextResponse.json({ facts: await list(params.id) });
}
