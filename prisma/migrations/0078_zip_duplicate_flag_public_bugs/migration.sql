-- Three beta-prep changes, Mike 2026-09-12. Purely additive plus one relaxed
-- NOT NULL: nothing is dropped, renamed or rewritten.
--
-- 1. Project gets a zip code and a contact name ("Yes add zip and add all 3 to
--    the conceptual tool on the 1st page with name and email"). Project already
--    had city, state and contactEmail.
ALTER TABLE "Project" ADD COLUMN "zip" TEXT;
ALTER TABLE "Project" ADD COLUMN "contactName" TEXT;

-- 2. A public request that looks like a job we already have is flagged on our
--    side at submit time ("Looks like [Project X]"). The suggestion is kept
--    apart from duplicateMatchId, which only a person sets: a guess must never
--    count as a link. Dismissing stamps a date instead of deleting anything.
ALTER TABLE "ConceptualSubmission" ADD COLUMN "suggestedProjectId" TEXT;
ALTER TABLE "ConceptualSubmission" ADD COLUMN "suggestedMatchReason" TEXT;
ALTER TABLE "ConceptualSubmission" ADD COLUMN "suggestionDismissedAt" TIMESTAMP(3);
ALTER TABLE "ConceptualSubmission" ADD CONSTRAINT "ConceptualSubmission_suggestedProjectId_fkey"
  FOREIGN KEY ("suggestedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Beta visitors on the public conceptual-budget page can report a bug
--    without an account. Their reports land on the same bug board, with the
--    name and email they typed instead of a user. Staff reports are unchanged.
ALTER TABLE "BugReport" ALTER COLUMN "reporterId" DROP NOT NULL;
ALTER TABLE "BugReport" ADD COLUMN "reporterName" TEXT;
ALTER TABLE "BugReport" ADD COLUMN "reporterEmail" TEXT;
ALTER TABLE "BugReport" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'STAFF';
