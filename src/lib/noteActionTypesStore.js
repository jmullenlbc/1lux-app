import { prisma } from '@/lib/db';
import { DEFAULT_ACTION_TYPES } from '@/lib/noteActions';

/**
 * Seed the NoteActionType table with the method-based defaults if it's empty.
 * Idempotent + safe to call from any request path (local dev + prod). Templates
 * and instructions are intentionally left blank for the admin to fill in.
 */
export async function ensureActionTypesSeeded() {
  const count = await prisma.noteActionType.count();
  if (count > 0) return;
  await prisma.noteActionType.createMany({
    data: DEFAULT_ACTION_TYPES.map(t => ({
      key:         t.key,
      label:       t.label,
      executor:    t.executor,
      kind:        t.kind,
      description: t.description ?? null,
      reminderDays: t.reminderDays ?? null,
      sortOrder:   t.sortOrder ?? 0,
      isActive:    true,
    })),
    skipDuplicates: true,
  });
}

/** All types (admin view), seeding defaults first. */
export async function getAllActionTypes() {
  await ensureActionTypesSeeded();
  return prisma.noteActionType.findMany({ orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] });
}

/** Active types only (classifier + dropdown). */
export async function getActiveActionTypes() {
  await ensureActionTypesSeeded();
  return prisma.noteActionType.findMany({
    where:   { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
}
