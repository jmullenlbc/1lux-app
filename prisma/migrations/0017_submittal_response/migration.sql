-- ILC response drafts for submittal reviewer notes
-- One response per review note, AI-generated via Claude Haiku, editable before approval

CREATE TABLE "SubmittalResponse" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "reviewId"    TEXT NOT NULL UNIQUE REFERENCES "SubmittalReview"("id") ON DELETE CASCADE,
  "body"        TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'DRAFT',
  "generatedBy" TEXT NOT NULL DEFAULT 'AI',
  "editedAt"    TIMESTAMP(3),
  "approvedAt"  TIMESTAMP(3),
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SubmittalResponse_reviewId_idx" ON "SubmittalResponse"("reviewId");
