import { prisma } from '@/lib/db';
import { DEFAULT_ACTION_TYPES } from '@/lib/noteActions';

/**
 * Add any default step type whose key is missing (it used to seed only an empty
 * table, so a type added later never arrived). Existing rows are never changed.
 * Idempotent + safe to call from any request path (local dev + prod). Templates
 * and instructions are intentionally left blank for the admin to fill in.
 * No skipDuplicates: it throws on SQLite.
 */
export async function ensureActionTypesSeeded() {
  const have = new Set((await prisma.noteActionType.findMany({ select: { key: true } })).map(t => t.key));
  const missing = DEFAULT_ACTION_TYPES.filter(t => !have.has(t.key));
  if (missing.length === 0) return;
  await prisma.noteActionType.createMany({
    data: missing.map(t => ({
      key:         t.key,
      label:       t.label,
      executor:    t.executor,
      kind:        t.kind,
      description: t.description ?? null,
      reminderDays: t.reminderDays ?? null,
      reminder2Days: t.reminder2Days ?? null,
      reminder3Days: t.reminder3Days ?? null,
      sortOrder:   t.sortOrder ?? 0,
      isActive:    true,
    })),
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
