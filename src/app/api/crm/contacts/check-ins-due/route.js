import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/crm/contacts/check-ins-due
// Query: ?status=overdue | due_soon
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status'); // 'overdue' | 'due_soon' | null

  // 1. Load cadence rules indexed by tier
  const cadenceRules = await prisma.relationshipCadenceRule.findMany({
    where: { isActive: true },
  });
  const ruleByTier = Object.fromEntries(cadenceRules.map(r => [r.tier, r.cadenceDays]));

  // 2. Load all contacts that may be cadence-relevant
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { cadenceTier: { not: null } },
        { lastInPersonAt: { not: null } },
        { lastTouchpointAt: { not: null } },
      ],
    },
    include: {
      client: { select: { id: true, name: true, cadenceDays: true } },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results = [];

  for (const contact of contacts) {
    // Compute effectiveCadenceDays
    const effectiveCadenceDays =
      contact.cadenceDays ??
      contact.client?.cadenceDays ??
      (contact.cadenceTier ? ruleByTier[contact.cadenceTier] : null) ??
      90;

    // Reference date: lastInPersonAt preferred, else lastTouchpointAt
    const referenceDate = contact.lastInPersonAt ?? contact.lastTouchpointAt;

    // Skip contacts with no reference date at all
    if (!referenceDate) continue;

    // Check nextCheckInAt snooze: if set and in the future, skip
    if (contact.nextCheckInAt) {
      const snoozeDate = new Date(contact.nextCheckInAt);
      snoozeDate.setHours(0, 0, 0, 0);
      if (snoozeDate >= today) continue;
    }

    const ref = new Date(referenceDate);
    ref.setHours(0, 0, 0, 0);

    const daysSinceLastInPerson = contact.lastInPersonAt
      ? Math.floor((today - new Date(contact.lastInPersonAt).setHours(0, 0, 0, 0)) / 86400000)
      : null;

    // daysOverdue: positive = overdue, negative = days remaining
    const msElapsed = today - ref;
    const daysElapsed = Math.floor(msElapsed / 86400000);
    const daysOverdue = daysElapsed - effectiveCadenceDays;

    // Apply status filter
    if (status === 'overdue' && daysOverdue <= 0) continue;
    if (status === 'due_soon' && daysOverdue <= -14) continue;

    results.push({
      id:                   contact.id,
      name:                 contact.name,
      preferredName:        contact.preferredName,
      title:                contact.title,
      company:              contact.company,
      email:                contact.email,
      cadenceTier:          contact.cadenceTier,
      cadenceDays:          contact.cadenceDays,
      lastInPersonAt:       contact.lastInPersonAt,
      lastTouchpointAt:     contact.lastTouchpointAt,
      nextCheckInAt:        contact.nextCheckInAt,
      effectiveCadenceDays,
      daysSinceLastInPerson,
      daysOverdue,
      client:               contact.client ? { name: contact.client.name } : null,
    });
  }

  // Sort by daysOverdue descending (most overdue first)
  results.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return NextResponse.json({ contacts: results, total: results.length });
}
