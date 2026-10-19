-- 0136: "We suggest" learning set and quote details (Mike 10-18). Additive only.
--   SpecSwap   one past pairing of an original spec and what ILC proposed,
--              learned from peer review matrices and project Peer Review rows
--   BidLine    + requestedMfr / requestedCatalog (what the drawings asked for
--              when a bidder offers something else), optionGroup (BASE | VE |
--              ALT, so a value engineering package or an alternate never mixes
--              into the base bid), productId (our product this line matches)

CREATE TABLE "SpecSwap" (
    "id" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sheetName" TEXT,
    "sheetDate" TIMESTAMP(3),
    "projectId" TEXT,
    "typeTag" TEXT,
    "description" TEXT,
    "category" TEXT,
    "origMfr" TEXT,
    "origCatalog" TEXT,
    "origFamily" TEXT,
    "propMfr" TEXT,
    "propCatalog" TEXT,
    "propFamily" TEXT,
    "productId" TEXT,
    "outcome" TEXT NOT NULL,
    "qty" DOUBLE PRECISION,
    "uom" TEXT,
    "unitCn" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "SpecSwap_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpecSwap_origFamily_idx" ON "SpecSwap"("origFamily");
CREATE INDEX "SpecSwap_propFamily_idx" ON "SpecSwap"("propFamily");
CREATE INDEX "SpecSwap_sourceName_idx" ON "SpecSwap"("sourceName");
CREATE INDEX "SpecSwap_projectId_idx" ON "SpecSwap"("projectId");
CREATE INDEX "SpecSwap_productId_idx" ON "SpecSwap"("productId");

ALTER TABLE "SpecSwap" ADD CONSTRAINT "SpecSwap_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SpecSwap" ADD CONSTRAINT "SpecSwap_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ManufacturerProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BidLine" ADD COLUMN "requestedMfr" TEXT;
ALTER TABLE "BidLine" ADD COLUMN "requestedCatalog" TEXT;
ALTER TABLE "BidLine" ADD COLUMN "optionGroup" TEXT NOT NULL DEFAULT 'BASE';
ALTER TABLE "BidLine" ADD COLUMN "productId" TEXT;

CREATE INDEX "BidLine_productId_idx" ON "BidLine"("productId");

ALTER TABLE "BidLine" ADD CONSTRAINT "BidLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ManufacturerProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
