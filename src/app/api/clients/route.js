import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { clientTypeKeyFromLabel } from '@/lib/utils';
import { deriveClientTypeKey } from '@/lib/crmClient';

// The project fields the deal counters need. Kept tiny on purpose, the clients
// list loads every client, so we only pull the four columns the counting rule
// reads (see dealCounts in src/lib/crmClient.js).
const DEAL_COUNT_PROJECT_SELECT = {
  id: true, name: true, serviceType: true, projectType: true,
  procurementStatus: true, procurementStatusReason: true,
  designStatus: true, designStatusReason: true,
};

// GET /api/clients, every ILC staff account sees every client.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;


  const clients = await prisma.client.findMany({
    where: canSeeAllData(user) ? {} : { createdById: user.id },
    orderBy: { clientNumber: 'asc' },
    include: {
      _count: { select: { projects: { where: { archivedAt: null } }, contacts: { where: { archivedAt: null } } } },
      createdBy: { select: { name: true, email: true } },
      owner:     { select: { id: true, name: true, email: true } },
      projects:  { where: { archivedAt: null }, select: DEAL_COUNT_PROJECT_SELECT },
      tagLinks:  { include: { tag: true } },
    },
  });

  return NextResponse.json({ clients });
}

// POST /api/clients, create a client
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const {
    name, type, locationType, notes,
    email, phone, website, address, city, state,
    linkedIn, primaryContact, primaryContactTitle,
    primaryContactEmail, primaryContactPhone,
    orgTypes, developerTypes, projectTypes, markets, rating, ownerId, tagIds,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Client name is required' }, { status: 400 });
  }

  // Client Type is a multi-select stored in orgTypes as labels; the single
  // `type` column is the first tick, so colour tags and stats keep working.
  const orgTypeList = Array.isArray(orgTypes) ? orgTypes : [];
  const derivedType = orgTypeList.length
    ? deriveClientTypeKey(orgTypeList, clientTypeKeyFromLabel)
    : null;

  // Generate next clientNumber
  const agg = await prisma.client.aggregate({ _max: { clientNumber: true } });
  const clientNumber = (agg._max.clientNumber ?? 0) + 1;

  const client = await prisma.client.create({
    data: {
      clientNumber,
      name:         name.trim(),
      // type is required in the schema (default "developer"): undefined lets the
      // default apply; null made Prisma reject the whole create.
      type:         derivedType  || type || undefined,
      locationType: locationType || 'standalone',
      notes:        notes        || null,
      email:        email        || null,
      phone:        phone        || null,
      website:      website      || null,
      address:      address      || null,
      city:         city         || null,
      state:        state        || null,
      linkedIn:     linkedIn     || null,
      primaryContact:      primaryContact      || null,
      primaryContactTitle: primaryContactTitle || null,
      primaryContactEmail: primaryContactEmail || null,
      primaryContactPhone: primaryContactPhone || null,
      rating:       rating       || null,
      ownerId:      ownerId      || null,
      ...(Array.isArray(orgTypes)       && { orgTypes:       JSON.stringify(orgTypes) }),
      ...(Array.isArray(developerTypes) && {
        developerTypes: JSON.stringify(developerTypes),
        developerType:  developerTypes[0] || null,   // legacy column stays in sync
      }),
      ...(Array.isArray(projectTypes)   && { projectTypes:   JSON.stringify(projectTypes) }),
      ...(Array.isArray(markets)        && { markets:        JSON.stringify(markets) }),
      ...(Array.isArray(tagIds) && tagIds.length && {
        tagLinks: { create: tagIds.map(tagId => ({ tagId })) },
      }),
      createdById:  user.id,
    },
    include: { tagLinks: { include: { tag: true } } },
  });

  return NextResponse.json({ client }, { status: 201 });
}
