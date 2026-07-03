import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function nextContactNumber() {
  const max = await prisma.contact.aggregate({ _max: { contactNumber: true } });
  return (max._max.contactNumber ?? 0) + 1;
}

// GET /api/crm/contacts
// Query: search, clientId
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search   = searchParams.get('search');
  const clientId = searchParams.get('clientId');

  const where = {};
  if (clientId) where.clientId = clientId;
  if (search) {
    where.OR = [
      { name:  { contains: search } },
      { email: { contains: search } },
      { title: { contains: search } },
    ];
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      client: { select: { id: true, clientNumber: true, name: true } },
    },
    take: 50,
  });

  return NextResponse.json({ contacts });
}

// POST /api/crm/contacts
// Body: { name, title?, email?, phone?, notes?, clientId? }
// clientId must be a real Client.id — not matched by text
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { name, title, email, phone, notes, clientId, linkedInUrl, preferredName, company } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  // Validate clientId by ID — never by text
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ error: 'clientId not found' }, { status: 400 });
  }

  const contactNumber = await nextContactNumber();

  const contact = await prisma.contact.create({
    data: {
      contactNumber,
      name:          name.trim(),
      title:         title         || null,
      email:         email         || null,
      phone:         phone         || null,
      notes:         notes         || null,
      clientId:      clientId      || null,
      linkedInUrl:   linkedInUrl   || null,
      preferredName: preferredName || null,
      company:       company       || null,
    },
    include: {
      client: { select: { id: true, clientNumber: true, name: true } },
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
