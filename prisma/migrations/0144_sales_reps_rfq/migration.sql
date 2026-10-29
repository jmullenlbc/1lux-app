-- 0144 Sales reps and RFQs (Mike 10-29). Additive only.
-- Replaces the Trackvia rep tables: ILC offices, sales reps and their emails,
-- manufacturer to rep links per office, project rep picks, RFQs and their
-- lines, rep quotes brought back in, and a record history for all of them.
-- Manufacturer.buyDirect and Project.ourOfficeId are new columns with safe defaults.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ourOfficeId" TEXT;

-- AlterTable
ALTER TABLE "Manufacturer" ADD COLUMN     "buyDirect" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OurOffice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT 'Innovative Lighting Consultants dba ILC Studios',
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "pricingEmail" TEXT,
    "ordersEmail" TEXT,
    "rfqNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OurOffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRep" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "mainPhone" TEXT,
    "secondPhone" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "trackviaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepEmail" (
    "id" TEXT NOT NULL,
    "salesRepId" TEXT,
    "manufacturerId" TEXT,
    "purpose" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturerRep" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "salesRepId" TEXT NOT NULL,
    "officeId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturerRep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRepPick" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "salesRepId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRepPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "projectId" TEXT NOT NULL,
    "salesRepId" TEXT,
    "manufacturerId" TEXT,
    "officeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "toName" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL DEFAULT '',
    "needBy" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "sentById" TEXT,
    "sentByName" TEXT,
    "revisesId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqLine" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "peerReviewItemId" TEXT,
    "typeCode" TEXT NOT NULL DEFAULT '',
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "partNumber" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "qty" DOUBLE PRECISION,
    "dnPrice" DOUBLE PRECISION,
    "priceSource" TEXT,
    "confidence" DOUBLE PRECISION,
    "receivedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqQuote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rfqId" TEXT,
    "fileName" TEXT NOT NULL DEFAULT '',
    "quoteNumber" TEXT,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqQuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "typeTag" TEXT NOT NULL DEFAULT '',
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "catalog" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "qty" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION,
    "rfqLineId" TEXT,
    "confidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordHistory" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesRep_trackviaId_key" ON "SalesRep"("trackviaId");

-- CreateIndex
CREATE INDEX "SalesRep_name_idx" ON "SalesRep"("name");

-- CreateIndex
CREATE INDEX "RepEmail_salesRepId_idx" ON "RepEmail"("salesRepId");

-- CreateIndex
CREATE INDEX "RepEmail_manufacturerId_idx" ON "RepEmail"("manufacturerId");

-- CreateIndex
CREATE INDEX "ManufacturerRep_manufacturerId_idx" ON "ManufacturerRep"("manufacturerId");

-- CreateIndex
CREATE INDEX "ManufacturerRep_salesRepId_idx" ON "ManufacturerRep"("salesRepId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRepPick_projectId_manufacturerId_key" ON "ProjectRepPick"("projectId", "manufacturerId");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_number_key" ON "Rfq"("number");

-- CreateIndex
CREATE INDEX "Rfq_projectId_idx" ON "Rfq"("projectId");

-- CreateIndex
CREATE INDEX "Rfq_salesRepId_idx" ON "Rfq"("salesRepId");

-- CreateIndex
CREATE INDEX "RfqLine_rfqId_idx" ON "RfqLine"("rfqId");

-- CreateIndex
CREATE INDEX "RfqLine_peerReviewItemId_idx" ON "RfqLine"("peerReviewItemId");

-- CreateIndex
CREATE INDEX "RfqQuote_projectId_idx" ON "RfqQuote"("projectId");

-- CreateIndex
CREATE INDEX "RfqQuoteLine_quoteId_idx" ON "RfqQuoteLine"("quoteId");

-- CreateIndex
CREATE INDEX "RecordHistory_entityType_entityId_createdAt_idx" ON "RecordHistory"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ourOfficeId_fkey" FOREIGN KEY ("ourOfficeId") REFERENCES "OurOffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepEmail" ADD CONSTRAINT "RepEmail_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "SalesRep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepEmail" ADD CONSTRAINT "RepEmail_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturerRep" ADD CONSTRAINT "ManufacturerRep_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturerRep" ADD CONSTRAINT "ManufacturerRep_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "SalesRep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturerRep" ADD CONSTRAINT "ManufacturerRep_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "OurOffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRepPick" ADD CONSTRAINT "ProjectRepPick_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRepPick" ADD CONSTRAINT "ProjectRepPick_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRepPick" ADD CONSTRAINT "ProjectRepPick_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "SalesRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "SalesRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "OurOffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqLine" ADD CONSTRAINT "RfqLine_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqLine" ADD CONSTRAINT "RfqLine_peerReviewItemId_fkey" FOREIGN KEY ("peerReviewItemId") REFERENCES "PeerReviewItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuote" ADD CONSTRAINT "RfqQuote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuote" ADD CONSTRAINT "RfqQuote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteLine" ADD CONSTRAINT "RfqQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "RfqQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The three ILC offices. Florida is a placeholder address until Mike has the real one.
INSERT INTO "OurOffice" ("id", "name", "street", "city", "state", "zip", "phone", "pricingEmail", "ordersEmail", "sortOrder", "updatedAt") VALUES
  ('office_denver', 'Denver', '2301 Blake Street, Suite 100', 'Denver', 'CO', '80205', '720-248-8208', 'orders@ilcstudios.com', 'orders@ilcstudios.com', 1, CURRENT_TIMESTAMP),
  ('office_long_beach', 'Long Beach', '111 West Ocean Blvd. Suite #400', 'Long Beach', 'CA', '90802', '720-248-8208', 'orders@ilcstudios.com', 'orders@ilcstudios.com', 2, CURRENT_TIMESTAMP),
  ('office_florida', 'Florida', '555 Main St.', 'Your Home', 'FL', '33101', '720-248-8208', 'orders@ilcstudios.com', 'orders@ilcstudios.com', 3, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
