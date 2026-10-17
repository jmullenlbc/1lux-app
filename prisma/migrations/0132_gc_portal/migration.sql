-- 0132: the GC portal (Mike 10-16). A general contractor types a work email
-- and sees every web budget from their company, who made it, who last
-- changed it, and can copy one. Three additions, all additive:
--   ConceptualDraft.copiedFromId  which budget a Copy came from
--   ConceptualDraftSave / Change  who saved, when, and every value that moved
--   ConceptualDraftMatch          "same project?" answers, one row per pair
ALTER TABLE "ConceptualDraft" ADD COLUMN "copiedFromId" TEXT;
-- A project has many budgets (Mike 10-16: "lone tree ranch" then "100% DD").
ALTER TABLE "ConceptualDraft" ADD COLUMN "budgetName" TEXT;
ALTER TABLE "ConceptualSubmission" ADD COLUMN "budgetName" TEXT;

CREATE INDEX "ConceptualDraft_emailDomain_idx" ON "ConceptualDraft"("emailDomain");
CREATE INDEX "ConceptualDraft_copiedFromId_idx" ON "ConceptualDraft"("copiedFromId");

ALTER TABLE "ConceptualDraft" ADD CONSTRAINT "ConceptualDraft_copiedFromId_fkey"
  FOREIGN KEY ("copiedFromId") REFERENCES "ConceptualDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ConceptualDraftSave" (
    "id"      TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "email"   TEXT NOT NULL,
    "stepId"  TEXT,
    "kind"    TEXT NOT NULL DEFAULT 'save',
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConceptualDraftSave_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConceptualDraftSave_draftId_savedAt_idx" ON "ConceptualDraftSave"("draftId", "savedAt");

ALTER TABLE "ConceptualDraftSave" ADD CONSTRAINT "ConceptualDraftSave_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "ConceptualDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConceptualDraftChange" (
    "id"     TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "kind"   TEXT NOT NULL,
    "key"    TEXT NOT NULL,
    "before" TEXT NOT NULL,
    "after"  TEXT NOT NULL,

    CONSTRAINT "ConceptualDraftChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConceptualDraftChange_saveId_idx" ON "ConceptualDraftChange"("saveId");
CREATE INDEX "ConceptualDraftChange_kind_key_idx" ON "ConceptualDraftChange"("kind", "key");

ALTER TABLE "ConceptualDraftChange" ADD CONSTRAINT "ConceptualDraftChange_saveId_fkey"
  FOREIGN KEY ("saveId") REFERENCES "ConceptualDraftSave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConceptualDraftMatch" (
    "id"             TEXT NOT NULL,
    "draftId"        TEXT NOT NULL,
    "otherDraftId"   TEXT NOT NULL,
    "same"           BOOLEAN NOT NULL,
    "decidedByEmail" TEXT NOT NULL,
    "decidedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConceptualDraftMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConceptualDraftMatch_draftId_otherDraftId_key" ON "ConceptualDraftMatch"("draftId", "otherDraftId");
CREATE INDEX "ConceptualDraftMatch_otherDraftId_idx" ON "ConceptualDraftMatch"("otherDraftId");

ALTER TABLE "ConceptualDraftMatch" ADD CONSTRAINT "ConceptualDraftMatch_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "ConceptualDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConceptualDraftMatch" ADD CONSTRAINT "ConceptualDraftMatch_otherDraftId_fkey"
  FOREIGN KEY ("otherDraftId") REFERENCES "ConceptualDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
