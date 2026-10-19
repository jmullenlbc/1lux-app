-- 0135: Bid Leveling (Mike 10-18). Two to four lighting bids on one project,
-- joined on the fixture type tag. Seven new tables, nothing else touched:
--   BidLeveling     one leveling; settings are columns, not JSON
--   Bid             one bid (an uploaded quote or an ILC matrix snapshot, CN only)
--   BidTotal        one row per quoted bucket (fixtures, controls, freight, tax...)
--   BidLine         one row per type tag on a bid; accessories are columns
--   BidFlag         one row per inclusion question (freight, EM, tax...)
--   BidTypeAlias    how a raw tag maps to a type (LT03 = LT-03)
--   BidPlaceholder  a person-set price for scope a bid never priced

CREATE TABLE "BidLeveling" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "baselineBidId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "freightMode" TEXT NOT NULL DEFAULT 'RATIO',
    "freightFlat" DOUBLE PRECISION,
    "whMode" TEXT NOT NULL DEFAULT 'RATIO',
    "whFlat" DOUBLE PRECISION,
    "taxRate" DOUBLE PRECISION,
    "taxBase" TEXT NOT NULL DEFAULT 'FIXTURES_CONTROLS',
    "hideCnFromPublic" BOOLEAN NOT NULL DEFAULT false,
    "publicToken" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "BidLeveling_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "levelingId" TEXT NOT NULL,
    "bidderName" TEXT NOT NULL,
    "bidderType" TEXT,
    "isIlc" BOOLEAN NOT NULL DEFAULT false,
    "quoteNumber" TEXT,
    "quoteDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "drawingSetRef" TEXT,
    "hasUnitPricing" BOOLEAN NOT NULL DEFAULT false,
    "taxRateStated" DOUBLE PRECISION,
    "sourceKind" TEXT NOT NULL DEFAULT 'PDF',
    "sourceFileKey" TEXT,
    "sourceFileName" TEXT,
    "sourceMatrixId" TEXT,
    "sourceVersion" INTEGER,
    "extractStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "extractModel" TEXT,
    "extractRawKey" TEXT,
    "extractError" TEXT,
    "notesRaw" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BidTotal" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BidTotal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BidLine" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "typeTagRaw" TEXT NOT NULL,
    "typeTag" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "section" TEXT,
    "description" TEXT,
    "mfr" TEXT,
    "catalog" TEXT,
    "qty" DOUBLE PRECISION,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "lengthFt" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION,
    "extPrice" DOUBLE PRECISION,
    "specBasis" TEXT,
    "isAccessory" BOOLEAN NOT NULL DEFAULT false,
    "driverIncl" TEXT,
    "poleIncl" TEXT,
    "boltsIncl" TEXT,
    "hoodIncl" TEXT,
    "channelIncl" TEXT,
    "transformerIncl" TEXT,
    "fanControllerIncl" TEXT,
    "watts" DOUBLE PRECISION,
    "volts" TEXT,
    "lumens" DOUBLE PRECISION,
    "lumensSetTo" DOUBLE PRECISION,
    "cct" TEXT,
    "cctOverride" TEXT,
    "cri" INTEGER,
    "emType" TEXT,
    "lineNote" TEXT,
    "sourcePage" INTEGER,
    "confidence" DOUBLE PRECISION,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BidFlag" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "value" TEXT,
    "evidence" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AI',

    CONSTRAINT "BidFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BidTypeAlias" (
    "id" TEXT NOT NULL,
    "levelingId" TEXT NOT NULL,
    "rawTag" TEXT NOT NULL,
    "typeTag" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'RULE',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BidTypeAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BidPlaceholder" (
    "id" TEXT NOT NULL,
    "levelingId" TEXT NOT NULL,
    "bidId" TEXT,
    "typeTag" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "BidPlaceholder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BidLeveling_publicToken_key" ON "BidLeveling"("publicToken");

CREATE INDEX "BidLeveling_projectId_idx" ON "BidLeveling"("projectId");

CREATE INDEX "Bid_levelingId_idx" ON "Bid"("levelingId");

CREATE INDEX "BidTotal_bidId_bucket_idx" ON "BidTotal"("bidId", "bucket");

CREATE INDEX "BidLine_bidId_typeTag_idx" ON "BidLine"("bidId", "typeTag");

CREATE UNIQUE INDEX "BidFlag_bidId_key_key" ON "BidFlag"("bidId", "key");

CREATE UNIQUE INDEX "BidTypeAlias_levelingId_rawTag_key" ON "BidTypeAlias"("levelingId", "rawTag");

CREATE INDEX "BidPlaceholder_levelingId_idx" ON "BidPlaceholder"("levelingId");

ALTER TABLE "BidLeveling" ADD CONSTRAINT "BidLeveling_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BidLeveling" ADD CONSTRAINT "BidLeveling_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Bid" ADD CONSTRAINT "Bid_levelingId_fkey" FOREIGN KEY ("levelingId") REFERENCES "BidLeveling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BidTotal" ADD CONSTRAINT "BidTotal_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BidLine" ADD CONSTRAINT "BidLine_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BidFlag" ADD CONSTRAINT "BidFlag_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BidTypeAlias" ADD CONSTRAINT "BidTypeAlias_levelingId_fkey" FOREIGN KEY ("levelingId") REFERENCES "BidLeveling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BidPlaceholder" ADD CONSTRAINT "BidPlaceholder_levelingId_fkey" FOREIGN KEY ("levelingId") REFERENCES "BidLeveling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BidPlaceholder" ADD CONSTRAINT "BidPlaceholder_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
