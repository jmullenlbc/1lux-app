// The "Amount spent" box on a sales note (0129). One SalesExpense row per note
// (noteId is unique). Clearing the box archives the row; typing an amount
// again brings the same row back. The row follows the note: its salesperson
// is the note's creator, its date the meeting date, its category the activity
// type, its company and project the first ones on the note.
import { categoryForActivity } from './expenses';

export const NOTE_EXPENSE_SELECT = { select: { id: true, amountCents: true, category: true, archivedAt: true } };

/**
 * amountCents: number (0 or more) to set, null to clear, undefined to leave
 * the amount alone and only re-sync date, company, project and category.
 */
export async function syncNoteExpense(prisma, noteId, amountCents, { userId = null } = {}) {
  const note = await prisma.note.findUnique({
    where:   { id: noteId },
    select:  {
      id: true, createdById: true, meetingDate: true, createdAt: true, activityType: true, projectId: true,
      owners:   { select: { userId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
      clients:  { select: { clientId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
      projects: { select: { projectId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
    },
  });
  if (!note) return null;
  const existing = await prisma.salesExpense.findUnique({ where: { noteId } });

  if (amountCents === undefined && !existing) return null;
  if (amountCents === null || amountCents === 0) {
    if (!existing) return null;
    if (existing.archivedAt) return existing;
    return prisma.salesExpense.update({ where: { id: existing.id }, data: { archivedAt: new Date(), archivedById: userId } });
  }

  const shared = {
    userId:    note.createdById || note.owners[0]?.userId || userId,
    spentOn:   note.meetingDate || note.createdAt,
    category:  categoryForActivity(note.activityType),
    clientId:  note.clients[0]?.clientId || null,
    projectId: note.projectId || note.projects[0]?.projectId || null,
  };
  if (!shared.userId) return null;

  if (existing) {
    return prisma.salesExpense.update({
      where: { id: existing.id },
      data:  { ...shared, ...(amountCents !== undefined ? { amountCents, archivedAt: null, archivedById: null } : {}) },
    });
  }
  return prisma.salesExpense.create({ data: { ...shared, noteId, amountCents, createdById: userId } });
}
