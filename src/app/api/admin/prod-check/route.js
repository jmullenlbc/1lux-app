import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth';

async function safeCount(query) {
  try {
    const rows = await prisma.$queryRawUnsafe(query);
    return rows;
  } catch (e) {
    return [{ error: e.message }];
  }
}

export async function GET(request) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  const legacyNotes = await safeCount(`
    SELECT 'SalesNote' AS t, count(*)::int AS n FROM "SalesNote"
    UNION ALL SELECT 'SalesNoteContact', count(*)::int FROM "SalesNoteContact"
    UNION ALL SELECT 'SalesNoteClient',  count(*)::int FROM "SalesNoteClient"
    UNION ALL SELECT 'SalesNoteDeal',    count(*)::int FROM "SalesNoteDeal"
    UNION ALL SELECT 'MeetingNote',      count(*)::int FROM "MeetingNote"
  `);

  const playbookCols = await safeCount(`
    SELECT
      count(*) FILTER (WHERE "architectRel"   IS NOT NULL)::int AS "architectRel",
      count(*) FILTER (WHERE "eeRel"          IS NOT NULL)::int AS "eeRel",
      count(*) FILTER (WHERE "gcRel"          IS NOT NULL)::int AS "gcRel",
      count(*) FILTER (WHERE "roleAssignments" IS NOT NULL)::int AS "roleAssignments"
    FROM "ClientPlaybook"
  `);

  return NextResponse.json({ legacyNotes, playbookCols });
}
