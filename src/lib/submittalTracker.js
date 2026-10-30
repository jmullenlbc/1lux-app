import { prisma } from '@/lib/db';
import { canSeeAllData } from '@/lib/auth';
import { OPENS_ITEM, inferResponsibleParty } from '@/lib/submittalStatus';

// Shared checks for the Submittal Tracker routes (Mike 10-29, 0146).
// Every route asks for the tracker through trackerFor, and every item,
// submission, version and review it touches through the owned* lookups, so an
// id from another project's tracker is a plain 404 instead of an edit.
// Items, submissions and reviews are archived, never deleted (archive.js).

export async function canAccessProject(projectId, user) {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { createdById: true } });
  if (!p) return false;
  return canSeeAllData(user) || p.createdById === user.id;
}

export async function trackerFor(projectId, user) {
  if (!await canAccessProject(projectId, user)) return null;
  return prisma.submittalTracker.findUnique({ where: { projectId } });
}

export const ownedItem = (trackerId, id) =>
  prisma.submittalItem.findFirst({ where: { id, trackerId } });

export const ownedSubmission = (trackerId, id) =>
  prisma.submittalSubmission.findFirst({ where: { id, trackerId } });

export const ownedVersion = (trackerId, id) =>
  prisma.submittalItemVersion.findFirst({
    where: { id, item: { trackerId, archivedAt: null }, submission: { archivedAt: null } },
    include: { item: true, submission: true },
  });

export const ownedReview = (trackerId, id) =>
  prisma.submittalReview.findFirst({
    where: { id, version: { item: { trackerId } } },
    include: { version: { include: { item: true, submission: true } }, response: true },
  });

// Round number of a submission: how many live rounds were made up to it.
export function roundOf(trackerId, submission) {
  return prisma.submittalSubmission.count({
    where: { trackerId, archivedAt: null, createdAt: { lte: submission.createdAt } },
  });
}

// Open or close open items from reviews, the same way for typed reviews and
// PDF reads. A review that leaves something to fix opens an item for its type
// and note kind, or marks the open one as a repeat. An Approved review closes
// every open item for its type. Boilerplate notes never open anything.
//   reviews: [{ status, notes, noteCategory, typeCode }]
export async function syncOpenItems({ projectId, round, reviews, db = prisma }) {
  const open = await db.submittalOpenItem.findMany({ where: { projectId, closedRound: null } });
  for (const r of reviews) {
    if (r.status === 'Approved') {
      await db.submittalOpenItem.updateMany({
        where: { projectId, typeCode: r.typeCode, closedRound: null },
        data: { closedRound: round },
      });
      for (const oi of open) if (oi.typeCode === r.typeCode) oi.closedRound = round;
      continue;
    }
    if (!OPENS_ITEM.includes(r.status)) continue;
    const category = r.noteCategory || 'OTHER';
    if (category === 'BOILERPLATE') continue;
    if (!r.notes?.trim() && r.status !== 'Rejected') continue;
    const existing = open.find((oi) => oi.typeCode === r.typeCode && oi.noteCategory === category && !oi.closedRound);
    if (existing) {
      await db.submittalOpenItem.update({
        where: { id: existing.id },
        data: { isRepeat: existing.openedRound < round || existing.isRepeat, noteText: r.notes || existing.noteText },
      });
    } else {
      const made = await db.submittalOpenItem.create({
        data: {
          projectId,
          typeCode: r.typeCode,
          noteCategory: category,
          responsibleParty: inferResponsibleParty(r.notes || '', category),
          noteText: r.notes || 'Rejected',
          openedRound: round,
        },
      });
      open.push(made);
    }
  }
}
