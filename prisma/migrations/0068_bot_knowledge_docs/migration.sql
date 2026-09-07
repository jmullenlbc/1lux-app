-- Bot Knowledge documents — files dropped on the Bot Knowledge page.
--
-- Purely additive: one new table, nothing dropped, renamed or retyped, and no
-- backfill. A Q&A pair (BotKnowledgeEntry) is something somebody sat down and
-- typed; this is the other half — the Word docs, spreadsheets, PDFs and images
-- that already exist. The original file is kept (storedPath) so it can be
-- re-read later; `text` is the flattened version the bot actually searches.
--
-- status is PENDING while the text is being pulled out, READY when it can be
-- used, FAILED when the file could not be read. A FAILED row is kept rather
-- than deleted, so the file is never silently lost.
--
-- PostgreSQL syntax throughout. amplify.yml runs `npx prisma migrate deploy`,
-- so this really does run against production.

CREATE TABLE "BotKnowledgeDoc" (
  "id"          TEXT NOT NULL,
  "category"    TEXT NOT NULL DEFAULT 'GENERAL',
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "fileName"    TEXT NOT NULL,
  "fileType"    TEXT NOT NULL,
  "mimeType"    TEXT,
  "sizeBytes"   INTEGER NOT NULL,
  "storedPath"  TEXT NOT NULL,
  "text"        TEXT,
  "charCount"   INTEGER NOT NULL DEFAULT 0,
  "pageCount"   INTEGER,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "statusNote"  TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BotKnowledgeDoc_pkey" PRIMARY KEY ("id")
);

-- One composite rather than three singles: every read filters on these three
-- columns in this order (src/lib/botKnowledge/retrieve.js), and a standalone
-- index on a two-value boolean earns nothing but write cost.
CREATE INDEX "BotKnowledgeDoc_isActive_status_category_idx"
  ON "BotKnowledgeDoc"("isActive", "status", "category");

-- Postgres does not index a foreign key column automatically, and without this
-- the SET NULL fired by deleting a user sequentially scans the whole table.
CREATE INDEX "BotKnowledgeDoc_createdById_idx" ON "BotKnowledgeDoc"("createdById");

-- The uploader is a nice-to-have, not the point of the row. Deleting a user
-- must not take their uploaded documents with them.
ALTER TABLE "BotKnowledgeDoc" ADD CONSTRAINT "BotKnowledgeDoc_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
