import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const ITEM_ORDERBY = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];
const SCHEDULE_INCLUDE = { items: { orderBy: ITEM_ORDERBY }, publishedBy: { select: { id: true, name: true } } };

// Split a catalogNumber on ' + ' delimiter, returning one entry per part
function splitCatalogNumber(raw) {
  if (!raw) return [null];
  const parts = raw.split(' + ').map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [raw];
}

// POST /api/projects/[id]/fixture-schedule/publish
// Body: { submissionTag?: string }
// 1. Publish the DRAFT as a new PUBLISHED version
// 2. Compute diff vs previous bid matrix (if any)
// 3. Create a DesignBidMatrix with split items, carrying forward pricing by type+partNumber
export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { submissionTag } = await request.json().catch(() => ({}));

  // Load current draft
  const draft = await prisma.fixtureSchedule.findFirst({
    where: { projectId: params.id, state: 'DRAFT' },
    include: SCHEDULE_INCLUDE,
  });
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });
  if (draft.items.length === 0) return NextResponse.json({ error: 'Draft has no rows' }, { status: 400 });

  // Next version number
  const lastPublished = await prisma.fixtureSchedule.findFirst({
    where: { projectId: params.id, state: 'PUBLISHED' },
    orderBy: { version: 'desc' },
  });
  const nextVersion = (lastPublished?.version ?? 0) + 1;

  // Load last bid matrix for pricing carry-forward
  const lastBid = await prisma.designBidMatrix.findFirst({
    where: { projectId: params.id },
    orderBy: { version: 'desc' },
    include: { items: true },
  });

  // Build pricing map: "type|partNumber" → { dnPerUnit, cnPerUnit, salesRep, rfqStatus }
  const pricingMap = new Map();
  if (lastBid) {
    for (const item of lastBid.items) {
      if (!item.isArchived) {
        const key = `${(item.type || '').toLowerCase()}|${(item.partNumber || '').toLowerCase()}`;
        pricingMap.set(key, {
          dnPerUnit:         item.dnPerUnit,
          cnPerUnit:         item.cnPerUnit,
          salesRep:          item.salesRep,
          rfqStatus:         item.rfqStatus,
          pricingLastUpdated: item.pricingLastUpdated,
        });
      }
    }
  }

  // Compute diff (added / removed / changed items vs last bid source schedule)
  let changeSummary = null;
  if (lastBid) {
    const prevSchedule = await prisma.fixtureSchedule.findUnique({
      where: { id: lastBid.sourceScheduleId },
      include: { items: true },
    });
    const prevKeys = new Set(prevSchedule?.items.map(i => `${i.type}|${i.location}|${i.catalogNumber}`) ?? []);
    const currKeys = new Set(draft.items.map(i => `${i.type}|${i.location}|${i.catalogNumber}`));
    const added   = draft.items.filter(i => !prevKeys.has(`${i.type}|${i.location}|${i.catalogNumber}`));
    const removed = (prevSchedule?.items ?? []).filter(i => !currKeys.has(`${i.type}|${i.location}|${i.catalogNumber}`));
    changeSummary = JSON.stringify({
      added:   added.map(i => ({ type: i.type, location: i.location, catalogNumber: i.catalogNumber })),
      removed: removed.map(i => ({ type: i.type, location: i.location, catalogNumber: i.catalogNumber })),
    });
  }

  // Next bid version number
  const nextBidVersion = (lastBid?.version ?? 0) + 1;

  // Build bid matrix items — split on ' + ' delimiter
  const bidItems = [];
  let sortOrder = 0;
  for (const schedItem of draft.items) {
    const parts = splitCatalogNumber(schedItem.catalogNumber);
    for (const partNumber of parts) {
      const pKey = `${(schedItem.type || '').toLowerCase()}|${(partNumber || '').toLowerCase()}`;
      const pricing = pricingMap.get(pKey) ?? {};
      bidItems.push({
        sourceItemId:       schedItem.id,
        type:               schedItem.type         || '',
        description:        schedItem.description  || '',
        locationTag:        schedItem.location      || null,
        manufacturer:       schedItem.manufacturer  || null,
        partNumber:         partNumber              || null,
        notes:              schedItem.notes         || null,
        internalNotes:      schedItem.internalNotes || null,
        sortOrder:          sortOrder++,
        dnPerUnit:          pricing.dnPerUnit         ?? null,
        cnPerUnit:          pricing.cnPerUnit         ?? null,
        salesRep:           pricing.salesRep          ?? null,
        rfqStatus:          pricing.rfqStatus         ?? null,
        pricingLastUpdated: pricing.pricingLastUpdated ?? null,
      });
    }
  }

  // Atomically: publish the draft + create a fresh draft + create the bid matrix
  const [newDraft, bidMatrix] = await prisma.$transaction(async tx => {
    // Publish the draft (make it immutable)
    const published = await tx.fixtureSchedule.update({
      where: { id: draft.id },
      data: {
        state:          'PUBLISHED',
        version:        nextVersion,
        publishedAt:    new Date(),
        publishedById:  user.id,
        submissionTag:  submissionTag || null,
      },
      include: SCHEDULE_INCLUDE,
    });

    // Create a fresh DRAFT (always keep one draft around)
    const newDraft = await tx.fixtureSchedule.create({
      data: {
        projectId: params.id,
        state:     'DRAFT',
        version:   0,
        items: {
          create: draft.items.map(item => ({
            type:          item.type,
            location:      item.location,
            description:   item.description,
            manufacturer:  item.manufacturer,
            catalogNumber: item.catalogNumber,
            finish:        item.finish,
            cct:           item.cct,
            lumens:        item.lumens,
            wattage:       item.wattage,
            voltage:       item.voltage,
            dimming:       item.dimming,
            mounting:      item.mounting,
            notes:         item.notes,
            internalNotes: item.internalNotes,
            sortOrder:     item.sortOrder,
          })),
        },
      },
      include: SCHEDULE_INCLUDE,
    });

    // Create DesignBidMatrix
    const matrix = await tx.designBidMatrix.create({
      data: {
        projectId:       params.id,
        sourceScheduleId: published.id,
        version:         nextBidVersion,
        pushedById:      user.id,
        submissionTag:   submissionTag || null,
        changeSummary,
        items: { create: bidItems },
      },
      include: {
        items:          { orderBy: [{ sortOrder: 'asc' }] },
        pushedBy:       { select: { id: true, name: true } },
        sourceSchedule: { select: { id: true, version: true, submissionTag: true } },
      },
    });

    return [newDraft, matrix];
  });

  return NextResponse.json({ draft: newDraft, bidMatrix, version: nextVersion });
}
