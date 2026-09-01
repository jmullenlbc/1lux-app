-- Conceptual-intake questionnaire answers — one row per answered question so
-- the review queue and bots can filter by any answer (no JSON blobs).
-- Purely additive; no existing table changes.
CREATE TABLE "ConceptualSubmissionAnswer" (
  "id"           TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "section"      TEXT NOT NULL,
  "questionKey"  TEXT NOT NULL,
  "question"     TEXT NOT NULL,
  "answer"       TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConceptualSubmissionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConceptualSubmissionAnswer_submissionId_idx" ON "ConceptualSubmissionAnswer"("submissionId");

-- CreateIndex
CREATE INDEX "ConceptualSubmissionAnswer_questionKey_idx" ON "ConceptualSubmissionAnswer"("questionKey");

-- AddForeignKey
ALTER TABLE "ConceptualSubmissionAnswer"
  ADD CONSTRAINT "ConceptualSubmissionAnswer_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "ConceptualSubmission"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
