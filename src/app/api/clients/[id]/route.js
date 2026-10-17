import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { archiveData, readArchivedFlag, deleteRefused, ARCHIVED_FLAG_HELP } from '@/lib/archive';
import { clientTypeKeyFromLabel } from '@/lib/utils';
import { deriveClientTypeKey } from '@/lib/crmClient';

async function getClientOrFail(id, user) {
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (!canSeeAllData(user) && client.createdById !== user.id) {
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { client };
}

// GET /api/clients/[id]
export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { client, err } = await getClientOrFail(params.id, user);
  if (err) return err;

  const full = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      projects: {
        where: { archivedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, projectNumber: true, name: true, location: true, city: true, state: true,
          buildingType: true, projectType: true, phase: true, budgetType: true,
          serviceType: true,
          procurementStatus: true, procurementStatusReason: true,
          designStatus: true, designStatusReason: true,
          status: true, createdAt: true, updatedAt: true,
        },
      },
      // People, each carrying the projects they are attached to so the
      // per-person deal counters can be worked out on the page.
      contacts: {
        where: { archivedAt: null },
        orderBy: { createdAt: 'asc' },
        include: {
          projectLinks: {
            where: { project: { archivedAt: null } },
            include: {
              project: {
                select: {
                  id: true, name: true, projectNumber: true, serviceType: true,
                  procurementStatus: true, procurementStatusReason: true,
                  designStatus: true, designStatusReason: true,
                },
              },
            },
          },
        },
      },
      tagLinks:  { include: { tag: true } },
      createdBy: { select: { name: true, email: true } },
      owner:     { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ client: full });
}

// PATCH /api/clients/[id]
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await getClientOrFail(params.id, user);
  if (err) return err;

  const body = await request.json();
  const {
    name, type, locationType, notes,
    email, phone, website, address, city, state,
    linkedIn, primaryContact, primaryContactTitle,
    primaryContactEmail, primaryContactPhone,
    tier, markets, geographies, projectTypes, projectsPerYear, pipelinePerUnit, developerType, orgTypes, ownerId, paymentTerms,
    developerTypes, rating, tagIds,
  } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: 'Client name cannot be empty' }, { status: 400 });
  }

  // Client Type is the multi-select now. When it changes, the single `type`
  // column follows the first tick so every screen already reading `type`
  // (colour tags, the Clients-page stats) stays right.
  const derivedType = orgTypes !== undefined
    ? deriveClientTypeKey(orgTypes, clientTypeKeyFromLabel)
    : null;

  const updated = await prisma.client.update({
    where: { id: params.id },
    data: {
      ...(name                !== undefined && { name: name.trim() }),
      ...(type                !== undefined && { type }),
      ...(locationType        !== undefined && { locationType }),
      ...(notes               !== undefined && { notes: notes || null }),
      ...(email               !== undefined && { email: email || null }),
      ...(phone               !== undefined && { phone: phone || null }),
      ...(website             !== undefined && { website: website || null }),
      ...(address             !== undefined && { address: address || null }),
      ...(city                !== undefined && { city: city || null }),
      ...(state               !== undefined && { state: state || null }),
      ...(linkedIn            !== undefined && { linkedIn: linkedIn || null }),
      ...(primaryContact      !== undefined && { primaryContact: primaryContact || null }),
      ...(primaryContactTitle !== undefined && { primaryContactTitle: primaryContactTitle || null }),
      ...(primaryContactEmail !== undefined && { primaryContactEmail: primaryContactEmail || null }),
      ...(primaryContactPhone !== undefined && { primaryContactPhone: primaryContactPhone || null }),
      ...(tier                !== undefined && { tier: tier || null }),
      ...(markets             !== undefined && { markets: JSON.stringify(markets) }),
      ...(geographies         !== undefined && { geographies: JSON.stringify(geographies) }),
      ...(projectTypes        !== undefined && { projectTypes: JSON.stringify(projectTypes) }),
      ...(projectsPerYear     !== undefined && { projectsPerYear: parseInt(projectsPerYear) || null }),
      ...(pipelinePerUnit     !== undefined && { pipelinePerUnit: pipelinePerUnit === '' || pipelinePerUnit == null ? null : Number(pipelinePerUnit) }),
      ...(developerType       !== undefined && { developerType: developerType || null }),
      // Multi-select Developer Type; the legacy single column tracks the first tick.
      ...(developerTypes      !== undefined && {
        developerTypes: JSON.stringify(developerTypes || []),
        developerType:  (developerTypes || [])[0] || null,
      }),
      ...(rating              !== undefined && { rating: rating || null }),
      ...(orgTypes            !== undefined && { orgTypes: JSON.stringify(orgTypes) }),
      ...(derivedType                       && { type: derivedType }),
      ...(ownerId             !== undefined && { ownerId: ownerId || null }),
      ...(paymentTerms        !== undefined && { paymentTerms: paymentTerms || null }),
      // Tags: replace the whole set in one write, so the links can never end up
      // half-applied if something fails partway.
      ...(Array.isArray(tagIds) && {
        tagLinks: {
          deleteMany: {},
          create: [...new Set(tagIds)].map(tagId => ({ tagId })),
        },
      }),
    },
    include: { tagLinks: { include: { tag: true } } },
  });

  return NextResponse.json({ client: updated });
}

// DELETE /api/clients/[id], refused. Companies are archived, never deleted
// (Mike, 2026-09-11: "archive only for everything"). Deleting used to unlink
// every project and silently blank the company's Project Team seats; archiving
// leaves all of that exactly as it is.
export async function DELETE() {
  return NextResponse.json({ error: deleteRefused('Companies') }, { status: 405 });
}

// POST /api/clients/[id]  { archived: true | false }, archive or restore.
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { err } = await getClientOrFail(params.id, user);
  if (err) return err;

  const archived = await readArchivedFlag(request);
  if (archived === null) return NextResponse.json({ error: ARCHIVED_FLAG_HELP }, { status: 400 });

  const client = await prisma.client.update({
    where:  { id: params.id },
    data:   archiveData(archived, user),
    select: { id: true, name: true, archivedAt: true },
  });
  return NextResponse.json({ client });
}
