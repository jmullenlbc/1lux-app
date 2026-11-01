-- RFQ versions, job rounds and everything we can pull from a rep quote (Mike 11-1).
-- A rep's RFQ counts its own versions (RFQ0041 V3). A round groups the sends for one
-- drawing submission (Bid Set, VE, GMP) so the whole job can be compared.
CREATE TABLE "RfqRound" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqRound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RfqRound_projectId_number_key" ON "RfqRound"("projectId", "number");

ALTER TABLE "RfqRound" ADD CONSTRAINT "RfqRound_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Rfq" ADD COLUMN "familyNumber" INTEGER;
ALTER TABLE "Rfq" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Rfq" ADD COLUMN "addOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Rfq" ADD COLUMN "roundId" TEXT;

CREATE INDEX "Rfq_familyNumber_idx" ON "Rfq"("familyNumber");
CREATE INDEX "Rfq_roundId_idx" ON "Rfq"("roundId");

ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RfqRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Quote wide facts, as the quote states them.
ALTER TABLE "RfqQuote" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "RfqQuote" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "RfqQuote" ADD COLUMN "fobPoint" TEXT;
ALTER TABLE "RfqQuote" ADD COLUMN "revisionNote" TEXT;
ALTER TABLE "RfqQuote" ADD COLUMN "leadTime" TEXT;
ALTER TABLE "RfqQuote" ADD COLUMN "productTotal" DOUBLE PRECISION;
ALTER TABLE "RfqQuote" ADD COLUMN "controlsTotal" DOUBLE PRECISION;
ALTER TABLE "RfqQuote" ADD COLUMN "sparesTotal" DOUBLE PRECISION;
ALTER TABLE "RfqQuote" ADD COLUMN "freightTotal" DOUBLE PRECISION;
ALTER TABLE "RfqQuote" ADD COLUMN "notesText" TEXT;
ALTER TABLE "RfqQuote" ADD COLUMN "fullText" TEXT;

-- Per row: the extended price, the lead time as written and in weeks, stock, discontinued.
ALTER TABLE "RfqQuoteLine" ADD COLUMN "extPrice" DOUBLE PRECISION;
ALTER TABLE "RfqQuoteLine" ADD COLUMN "uom" TEXT;
ALTER TABLE "RfqQuoteLine" ADD COLUMN "leadTime" TEXT;
ALTER TABLE "RfqQuoteLine" ADD COLUMN "leadWeeksMin" DOUBLE PRECISION;
ALTER TABLE "RfqQuoteLine" ADD COLUMN "leadWeeksMax" DOUBLE PRECISION;
ALTER TABLE "RfqQuoteLine" ADD COLUMN "stockNote" TEXT;
ALTER TABLE "RfqQuoteLine" ADD COLUMN "discontinued" BOOLEAN NOT NULL DEFAULT false;

-- What a quote says about freight, per brand. A blank manufacturer is the whole quote.
CREATE TABLE "RfqQuoteFreight" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "manufacturerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SILENT',
    "amount" DOUBLE PRECISION,
    "typedAmount" DOUBLE PRECISION,
    "wording" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfqQuoteFreight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RfqQuoteFreight_quoteId_idx" ON "RfqQuoteFreight"("quoteId");
CREATE INDEX "RfqQuoteFreight_manufacturerId_idx" ON "RfqQuoteFreight"("manufacturerId");

ALTER TABLE "RfqQuoteFreight" ADD CONSTRAINT "RfqQuoteFreight_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "RfqQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RfqQuoteFreight" ADD CONSTRAINT "RfqQuoteFreight_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Clauses worth searching: tariff, no partial orders, deposit, oversize freight,
-- freight allowed on a single shipment, accessorial fees. One row per clause.
CREATE TABLE "RfqQuoteTerm" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqQuoteTerm_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RfqQuoteTerm_quoteId_idx" ON "RfqQuoteTerm"("quoteId");
CREATE INDEX "RfqQuoteTerm_kind_idx" ON "RfqQuoteTerm"("kind");

ALTER TABLE "RfqQuoteTerm" ADD CONSTRAINT "RfqQuoteTerm_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "RfqQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every RFQ so far starts its own family, then Send revision chains join up.
UPDATE "Rfq" SET "familyNumber" = "number";

WITH RECURSIVE chain AS (
  SELECT "id", "number" AS root FROM "Rfq" WHERE "revisesId" IS NULL
  UNION ALL
  SELECT r."id", c.root FROM "Rfq" r JOIN chain c ON r."revisesId" = c."id"
)
UPDATE "Rfq" r SET "familyNumber" = c.root FROM chain c WHERE c."id" = r."id";

UPDATE "Rfq" r SET "version" = x.v
FROM (SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "familyNumber" ORDER BY "number"))::int AS v FROM "Rfq") x
WHERE x."id" = r."id";

-- One round per version a job has reached, so each old send lands in a round.
INSERT INTO "RfqRound" ("id", "projectId", "number", "name", "createdAt")
SELECT 'rr' || "projectId" || '_' || "version", "projectId", "version", '', MIN("createdAt")
FROM "Rfq"
GROUP BY "projectId", "version";

UPDATE "Rfq" r SET "roundId" = x."id"
FROM "RfqRound" x
WHERE x."projectId" = r."projectId" AND x."number" = r."version";
