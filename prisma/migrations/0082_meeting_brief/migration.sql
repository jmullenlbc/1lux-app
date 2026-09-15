-- 0082: Meeting Prep briefs on sales notes (Mike, 2026-09-14: "It's event
-- related, so not on clients. It's in the sales notes.")
--
-- A brief is built for one sales note: the facts the CRM already holds about
-- the people, companies and deals tied to the meeting, numbered F1, F2…, and
-- 3–5 talking points that each cite the facts they rest on. Structured rows,
-- not a JSON blob, so "which facts did that point come from" is a query.
--
-- Internal only, and it never stores a price: the fact builder
-- (src/lib/meetingPrep/brief.js) strips dollar figures before anything is saved.
--
-- Purely additive: four new tables, nothing existing is touched. PostgreSQL.

CREATE TABLE "MeetingBrief" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "createdById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "model" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingBrief_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeetingBriefFact" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "sourceKind" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "MeetingBriefFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeetingBriefPoint" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "MeetingBriefPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeetingBriefCitation" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,

    CONSTRAINT "MeetingBriefCitation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingBrief_noteId_createdAt_idx" ON "MeetingBrief"("noteId", "createdAt");
CREATE INDEX "MeetingBriefFact_briefId_idx" ON "MeetingBriefFact"("briefId");
CREATE INDEX "MeetingBriefPoint_briefId_idx" ON "MeetingBriefPoint"("briefId");
CREATE UNIQUE INDEX "MeetingBriefCitation_pointId_factId_key" ON "MeetingBriefCitation"("pointId", "factId");
CREATE INDEX "MeetingBriefCitation_factId_idx" ON "MeetingBriefCitation"("factId");

ALTER TABLE "MeetingBrief" ADD CONSTRAINT "MeetingBrief_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingBriefFact" ADD CONSTRAINT "MeetingBriefFact_briefId_fkey"
  FOREIGN KEY ("briefId") REFERENCES "MeetingBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingBriefPoint" ADD CONSTRAINT "MeetingBriefPoint_briefId_fkey"
  FOREIGN KEY ("briefId") REFERENCES "MeetingBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingBriefCitation" ADD CONSTRAINT "MeetingBriefCitation_pointId_fkey"
  FOREIGN KEY ("pointId") REFERENCES "MeetingBriefPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingBriefCitation" ADD CONSTRAINT "MeetingBriefCitation_factId_fkey"
  FOREIGN KEY ("factId") REFERENCES "MeetingBriefFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
