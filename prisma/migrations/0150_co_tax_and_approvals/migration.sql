-- Frozen sales tax on change orders and saved budget versions, plus a log of who
-- approved a change order, when and how. Additive only.
ALTER TABLE "ChangeOrder" ADD COLUMN "salesTaxPct" DOUBLE PRECISION;
ALTER TABLE "DesignBidMatrix" ADD COLUMN "salesTaxPct" DOUBLE PRECISION;
ALTER TABLE "ProjectExternalContact" ADD COLUMN "canApproveChangeOrders" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ChangeOrderApproval" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "userId" TEXT,
    "portalUserId" TEXT,
    "note" TEXT,
    "optionLabel" TEXT,
    "amount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeOrderApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeOrderApproval_changeOrderId_createdAt_idx" ON "ChangeOrderApproval"("changeOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChangeOrderApproval" ADD CONSTRAINT "ChangeOrderApproval_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangeOrderApproval" ADD CONSTRAINT "ChangeOrderApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeOrderApproval" ADD CONSTRAINT "ChangeOrderApproval_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing versions and change orders keep today's rate from here on
UPDATE "DesignBidMatrix" m SET "salesTaxPct" = pd."salesTaxPct" FROM "ProjectData" pd WHERE pd."projectId" = m."projectId";
UPDATE "ChangeOrder" c SET "salesTaxPct" = pd."salesTaxPct" FROM "ProjectData" pd WHERE pd."projectId" = c."projectId";

-- A sent or approved change order on a job with no rate on file has been priced at
-- zero tax, so it stays at zero. Drafts on a job with no rate stay blank and follow the job.
UPDATE "ChangeOrder" SET "salesTaxPct" = 0 WHERE "salesTaxPct" IS NULL AND "status" <> 'DRAFT';
