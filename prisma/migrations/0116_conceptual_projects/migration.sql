-- 0116: conceptual budgets become projects (Mike, 2026-10-03). Additive only.

-- An unfinished public budget that was turned into a project, and when Sales
-- was told about it (the sweep's claim stamp, so it runs once per draft).
ALTER TABLE "ConceptualDraft" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ConceptualDraft" ADD COLUMN "abandonedAlertedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "ConceptualDraft_projectId_key" ON "ConceptualDraft"("projectId");
ALTER TABLE "ConceptualDraft" ADD CONSTRAINT "ConceptualDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The number ladder: conceptual, then budget, then signed PO. Archive-only.
CREATE TABLE "ProjectBudgetAmount" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "fileId" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "ProjectBudgetAmount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectBudgetAmount_projectId_tier_idx" ON "ProjectBudgetAmount"("projectId", "tier");
CREATE INDEX "ProjectBudgetAmount_tier_archivedAt_idx" ON "ProjectBudgetAmount"("tier", "archivedAt");
ALTER TABLE "ProjectBudgetAmount" ADD CONSTRAINT "ProjectBudgetAmount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBudgetAmount" ADD CONSTRAINT "ProjectBudgetAmount_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectBudgetAmount" ADD CONSTRAINT "ProjectBudgetAmount_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
