// The freight percent for a quote with no dollar figure and no brand history (Mike 11-1).
// Set on Admin. Kept apart from freight.js, which runs in the browser.
import { prisma } from '@/lib/db';
import { STARTING_FREIGHT_PCT } from './freight.js';

const KEY = 'rfq_freight_start_pct';

export async function getStartingFreightPct() {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
    const n = row ? Number(row.value) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : STARTING_FREIGHT_PCT;
  } catch {
    return STARTING_FREIGHT_PCT;
  }
}

export async function setStartingFreightPct(pct, userId) {
  const value = String(pct);
  return prisma.appSetting.upsert({
    where:  { key: KEY },
    create: { key: KEY, value, updatedById: userId || null },
    update: { value, updatedById: userId || null },
  });
}
