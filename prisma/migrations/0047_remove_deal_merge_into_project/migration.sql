-- Phase 2: Deal is fully merged into Project. Create the project-side replacements,
-- then drop the Deal model + its ecosystem. Prod had 0 deals, so no data migration.

-- NoteProject: sales notes link to projects (replaces NoteDeal)
CREATE TABLE IF NOT EXISTS "NoteProject" (
  "id"        TEXT NOT NULL,
  "noteId"    TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoteProject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NoteProject_noteId_projectId_key" ON "NoteProject"("noteId", "projectId");
ALTER TABLE "NoteProject" ADD CONSTRAINT "NoteProject_noteId_fkey"    FOREIGN KEY ("noteId")    REFERENCES "Note"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteProject" ADD CONSTRAINT "NoteProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BotDraft gains projectId (replaces dealId)
ALTER TABLE "BotDraft" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
CREATE INDEX IF NOT EXISTS "BotDraft_projectId_idx" ON "BotDraft"("projectId");
ALTER TABLE "BotDraft" ADD CONSTRAINT "BotDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the Deal foreign-key columns off surviving tables
ALTER TABLE "BotDraft" DROP COLUMN IF EXISTS "dealId";
ALTER TABLE "Proposal" DROP COLUMN IF EXISTS "dealId";

-- Drop Deal + its ecosystem (CASCADE clears any remaining FKs)
DROP TABLE IF EXISTS "DealContact"      CASCADE;
DROP TABLE IF EXISTS "DealActivity"     CASCADE;
DROP TABLE IF EXISTS "NoteDeal"         CASCADE;
DROP TABLE IF EXISTS "MarketSignalDeal" CASCADE;
DROP TABLE IF EXISTS "Deal"             CASCADE;
