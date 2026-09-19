-- 0090 — visitor tracking for the public /conceptual_budget page.
--
-- Mike, 2026-09-16: "build the tracking feature, it would be hugely helpful."
-- One row per visit: where they came from, what kind of device, how far they
-- got, and the draft / request it turned into. No IP address, no browser
-- string, no full web address — visitorKey is a one-way hash.
--
-- Purely additive: one new table, four indexes, two foreign keys. Nothing
-- existing is altered or dropped.

CREATE TABLE "ConceptualVisit" (
    "id" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "referrerHost" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "deviceKind" TEXT NOT NULL DEFAULT 'desktop',
    "stepReached" TEXT NOT NULL DEFAULT 'about',
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "pings" INTEGER NOT NULL DEFAULT 1,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draftId" TEXT,
    "submissionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptualVisit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConceptualVisit_visitedAt_idx" ON "ConceptualVisit"("visitedAt");
CREATE INDEX "ConceptualVisit_visitorKey_idx" ON "ConceptualVisit"("visitorKey");
CREATE INDEX "ConceptualVisit_draftId_idx" ON "ConceptualVisit"("draftId");
CREATE INDEX "ConceptualVisit_submissionId_idx" ON "ConceptualVisit"("submissionId");

ALTER TABLE "ConceptualVisit" ADD CONSTRAINT "ConceptualVisit_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ConceptualDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConceptualVisit" ADD CONSTRAINT "ConceptualVisit_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ConceptualSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
