import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withdrawCheckInDrafts } from '@/lib/checkIns/checkInDrafts';

// PATCH /api/crm/contacts/[id]/cadence
// Body: { cadenceTier?, cadenceDays?, lastInPersonAt?, lastTouchpointAt?, nextCheckInAt? }
export async function PATCH(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const existing = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  const body = await request.json();
  const { cadenceTier, cadenceDays, lastInPersonAt, lastTouchpointAt, nextCheckInAt } = body;

  const data = {};
  if (cadenceTier    !== undefined) data.cadenceTier    = cadenceTier ?? null;
  if (cadenceDays    !== undefined) data.cadenceDays    = cadenceDays != null ? Number(cadenceDays) : null;
  if (nextCheckInAt  !== undefined) data.nextCheckInAt  = nextCheckInAt ? new Date(nextCheckInAt) : null;

  // Handle lastInPersonAt — also update lastTouchpointAt if the new value is more recent
  if (lastInPersonAt !== undefined) {
    const newInPerson = lastInPersonAt ? new Date(lastInPersonAt) : null;
    data.lastInPersonAt = newInPerson;

    if (newInPerson) {
      // Update lastTouchpointAt if the incoming lastInPersonAt is more recent than current
      const currentTouchpoint = lastTouchpointAt !== undefined
        ? (lastTouchpointAt ? new Date(lastTouchpointAt) : null)
        : existing.lastTouchpointAt;

      if (!currentTouchpoint || newInPerson > currentTouchpoint) {
        data.lastTouchpointAt = newInPerson;
      } else {
        if (lastTouchpointAt !== undefined) {
          data.lastTouchpointAt = lastTouchpointAt ? new Date(lastTouchpointAt) : null;
        }
      }
    } else {
      if (lastTouchpointAt !== undefined) {
        data.lastTouchpointAt = lastTouchpointAt ? new Date(lastTouchpointAt) : null;
      }
    }
  } else if (lastTouchpointAt !== undefined) {
    data.lastTouchpointAt = lastTouchpointAt ? new Date(lastTouchpointAt) : null;
  }

  const contact = await prisma.contact.update({
    where: { id: params.id },
    data,
    select: {
      id:              true,
      name:            true,
      preferredName:   true,
      cadenceTier:     true,
      cadenceDays:     true,
      lastInPersonAt:  true,
      lastTouchpointAt: true,
      nextCheckInAt:   true,
      updatedAt:       true,
    },
  });

  // Snoozed: the check-in email written for now is withdrawn, unless someone has
  // already worked on it. A fresh one is written the day before the snooze ends.
  if (data.nextCheckInAt && data.nextCheckInAt > new Date()) await withdrawCheckInDrafts(params.id);

  return NextResponse.json({ contact });
}
