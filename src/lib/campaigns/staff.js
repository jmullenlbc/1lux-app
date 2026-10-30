// Shared bits for the staff campaign APIs (0147).
import { prisma } from '@/lib/db';
import { badRequest } from '@/lib/salesDocs/access';
import { BLOCK_INCLUDE } from './send';

export const CAMPAIGN_INCLUDE = {
  list: { select: { id: true, name: true, kind: true, archivedAt: true } },
  createdBy: { select: { id: true, name: true } },
  sentBy: { select: { id: true, name: true } },
};

export const notFound = (what, code) => badRequest(`That ${what} was not found. Nothing changed. (${code})`, 404);

export async function loadCampaign(id) {
  return prisma.campaign.findUnique({ where: { id: String(id || '') }, include: CAMPAIGN_INCLUDE });
}

export async function loadList(id) {
  return prisma.campaignList.findUnique({ where: { id: String(id || '') }, include: { rules: { where: { archivedAt: null }, orderBy: { createdAt: 'asc' } } } });
}

export const cleanText = (v, max = 200) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/** Archive or restore from a PATCH body ({ archived: true|false }). */
export const archivePatch = (archived, user) => (archived ? { archivedAt: new Date(), archivedById: user.id } : { archivedAt: null, archivedById: null });

export { BLOCK_INCLUDE };
