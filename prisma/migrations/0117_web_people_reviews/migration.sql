-- 0117: a web budget makes its company and person, and a look alike goes to a
-- person to decide (Mike, 2026-10-04: "Joe Smith just filled out a budget and
-- you have a Joseph Smith. Same person?"). Additive only.

-- The company and person a public budget was tied to, from its first save.
ALTER TABLE "ConceptualDraft" ADD COLUMN "clientId" TEXT;
ALTER TABLE "ConceptualDraft" ADD COLUMN "contactId" TEXT;
ALTER TABLE "ConceptualSubmission" ADD COLUMN "contactId" TEXT;
CREATE INDEX "ConceptualDraft_clientId_idx" ON "ConceptualDraft"("clientId");
CREATE INDEX "ConceptualDraft_contactId_idx" ON "ConceptualDraft"("contactId");
CREATE INDEX "ConceptualSubmission_contactId_idx" ON "ConceptualSubmission"("contactId");
ALTER TABLE "ConceptualDraft" ADD CONSTRAINT "ConceptualDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConceptualDraft" ADD CONSTRAINT "ConceptualDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConceptualSubmission" ADD CONSTRAINT "ConceptualSubmission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "Same person? Same company? Same job?" One row per question. Archive-only.
CREATE TABLE "DuplicateReview" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "existingContactId" TEXT,
    "existingClientId" TEXT,
    "existingProjectId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "companyName" TEXT,
    "emailDomain" TEXT,
    "projectName" TEXT,
    "draftId" TEXT,
    "submissionId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "DuplicateReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DuplicateReview_status_kind_idx" ON "DuplicateReview"("status", "kind");
CREATE INDEX "DuplicateReview_draftId_idx" ON "DuplicateReview"("draftId");
CREATE INDEX "DuplicateReview_submissionId_idx" ON "DuplicateReview"("submissionId");
ALTER TABLE "DuplicateReview" ADD CONSTRAINT "DuplicateReview_existingContactId_fkey" FOREIGN KEY ("existingContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DuplicateReview" ADD CONSTRAINT "DuplicateReview_existingClientId_fkey" FOREIGN KEY ("existingClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DuplicateReview" ADD CONSTRAINT "DuplicateReview_existingProjectId_fkey" FOREIGN KEY ("existingProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DuplicateReview" ADD CONSTRAINT "DuplicateReview_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ConceptualDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DuplicateReview" ADD CONSTRAINT "DuplicateReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ConceptualSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DuplicateReview" ADD CONSTRAINT "DuplicateReview_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
