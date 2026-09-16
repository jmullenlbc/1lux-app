-- 0087: unfinished public conceptual budgets.
--
-- One row per visitor who got their name, email and project name in on the
-- public /conceptual_budget wizard and then kept going. The wizard updates the
-- same row as they work (saveCount, lastSavedAt). Inputs only — never a price.
-- Staff see these on the intake queue as leads ("still working" for the first
-- day, "abandoned" after that). Submitting links the row to the real
-- ConceptualSubmission through submissionId. Archive-only: "Put away" stamps
-- archivedAt; rows are never deleted (src/lib/archive.js NEVER_DELETED).
--
-- The resume link's token is never stored — only its SHA-256 (tokenHash).
--
-- Additive only: two new tables, nothing existing is touched.
CREATE TABLE "ConceptualDraft" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailDomain" TEXT,
    "company" TEXT,
    "projectName" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "haveDrawings" TEXT,
    "stepId" TEXT,
    "completedSteps" TEXT NOT NULL DEFAULT '',
    "hasClubhouse" TEXT,
    "buildingType" TEXT,
    "unitCount" INTEGER,
    "grossSf" INTEGER,
    "drawingsJson" TEXT,
    "saveCount" INTEGER NOT NULL DEFAULT 1,
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkEmailedAt" TIMESTAMP(3),
    "submissionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptualDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConceptualDraft_tokenHash_key" ON "ConceptualDraft"("tokenHash");
CREATE UNIQUE INDEX "ConceptualDraft_submissionId_key" ON "ConceptualDraft"("submissionId");
CREATE INDEX "ConceptualDraft_lastSavedAt_idx" ON "ConceptualDraft"("lastSavedAt");
CREATE INDEX "ConceptualDraft_email_idx" ON "ConceptualDraft"("email");

ALTER TABLE "ConceptualDraft" ADD CONSTRAINT "ConceptualDraft_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ConceptualSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConceptualDraft" ADD CONSTRAINT "ConceptualDraft_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One row per typed figure, questionnaire answer or hand correction on a draft.
CREATE TABLE "ConceptualDraftField" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ConceptualDraftField_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConceptualDraftField_draftId_kind_key_key" ON "ConceptualDraftField"("draftId", "kind", "key");
CREATE INDEX "ConceptualDraftField_kind_key_idx" ON "ConceptualDraftField"("kind", "key");

ALTER TABLE "ConceptualDraftField" ADD CONSTRAINT "ConceptualDraftField_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ConceptualDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
