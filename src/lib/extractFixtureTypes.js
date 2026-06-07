/**
 * Extract fixture type codes from free text that match a project's actual fixture schedule.
 * Used by:
 *   1. shipFlag auto-set on RFI intake
 *   2. generate-draft context assembly
 *
 * Returns: string[] of matched type codes, uppercase, deduplicated.
 */
export async function extractFixtureTypes(text, projectId, prisma) {
  if (!text || !projectId) return [];

  // Load all FixtureSchedule records for this project, then their items
  const schedules = await prisma.fixtureSchedule.findMany({
    where:  { projectId },
    select: { id: true },
  });
  if (!schedules.length) return [];

  const scheduleIds = schedules.map(s => s.id);
  const scheduleItems = await prisma.fixtureScheduleItem.findMany({
    where:  { scheduleId: { in: scheduleIds } },
    select: { type: true },
  });

  // Build set of known type codes (uppercase, de-duped, non-empty)
  const typeSet = new Set(
    scheduleItems.map(t => (t.type || '').toUpperCase()).filter(Boolean)
  );
  if (!typeSet.size) return [];

  // Normalize text to uppercase so 'type g1' and 'TYPE G1' both match
  const normalizedText = text.toUpperCase();

  // Regex: 1-3 uppercase letters + optional digits + optional letter suffix
  // Matches: S4, BG, EP1, EW3, G1, P14, AL2A, BG2, etc.
  const candidates = [...normalizedText.matchAll(/\b([A-Z]{1,3}\d*[A-Z]?)\b/g)].map(m => m[1]);

  return [...new Set(candidates.filter(c => typeSet.has(c)))];
}

/**
 * Given a list of fixture type codes, return those that have active shipments.
 * Used for shipFlag auto-set on RFI intake.
 */
export async function getShipFlagTypes(typeCodes, projectId, prisma) {
  if (!typeCodes.length) return [];

  const activeStatuses = ['PO_PLACED', 'LEAD_TIME_CONFIRMED', 'ESD_CONFIRMED',
                          'SHIPPED', 'IN_TRANSIT', 'AT_WAREHOUSE', 'PARTIALLY_RELEASED'];

  const lineItems = await prisma.shipmentLineItem.findMany({
    where: {
      fixtureType: { in: typeCodes },
      shipment: {
        project_id: projectId,
        status:     { in: activeStatuses },
      },
    },
    select: { fixtureType: true },
  });

  return [...new Set(lineItems.map(li => li.fixtureType))];
}
