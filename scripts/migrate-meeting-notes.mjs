/**
 * Migration: add meetingDate, meetingLink, attendees columns to MeetingNote table.
 * Also ensures the MeetingNote table exists if it was never created.
 *
 * Run ONCE (safe to re-run — uses IF NOT EXISTS / ADD COLUMN logic):
 *   node scripts/migrate-meeting-notes.mjs
 *
 * You can run this while the dev server is running — it uses raw SQLite.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('Creating MeetingNote table if it does not exist…');

  // Create table (safe if already exists)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MeetingNote" (
      "id"          TEXT    NOT NULL PRIMARY KEY,
      "projectId"   TEXT    NOT NULL,
      "title"       TEXT    NOT NULL DEFAULT '',
      "content"     TEXT    NOT NULL DEFAULT '',
      "meetingDate" TEXT,
      "meetingLink" TEXT,
      "attendees"   TEXT,
      "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MeetingNote_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  console.log('  ✓ MeetingNote table ready');

  // Add new columns if they don't exist yet (SQLite requires ALTER TABLE per column)
  const colsToAdd = [
    { name: 'meetingDate', def: 'TEXT' },
    { name: 'meetingLink', def: 'TEXT' },
    { name: 'attendees',   def: 'TEXT' },
  ];

  // Get existing columns
  const info = await prisma.$queryRawUnsafe(`PRAGMA table_info("MeetingNote")`);
  const existing = new Set(info.map(r => r.name));

  for (const col of colsToAdd) {
    if (!existing.has(col.name)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "MeetingNote" ADD COLUMN "${col.name}" ${col.def}`
      );
      console.log(`  ✓ Added column: ${col.name}`);
    } else {
      console.log(`  – Column already exists: ${col.name}`);
    }
  }

  // Count existing notes
  const [{ count }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) as count FROM "MeetingNote"`
  );
  console.log(`\nMigration complete. ${count} existing meeting note(s).`);
}

run()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
