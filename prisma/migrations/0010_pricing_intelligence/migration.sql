-- AlterTable: add defaultDiscountPct to Manufacturer
ALTER TABLE "Manufacturer" ADD COLUMN "defaultDiscountPct" DOUBLE PRECISION;

-- CreateTable: ProductPriceHistory
CREATE TABLE "ProductPriceHistory" (
    "id" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "projectId" TEXT NOT NULL,
    "budgetVersion" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProductPriceCache
CREATE TABLE "ProductPriceCache" (
    "id" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "retailResults" TEXT NOT NULL,
    "lowestRetail" DOUBLE PRECISION NOT NULL,
    "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedBy" TEXT,
    CONSTRAINT "ProductPriceCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPriceHistory_manufacturer_partNumber_recordedAt_idx" ON "ProductPriceHistory"("manufacturer", "partNumber", "recordedAt");
CREATE UNIQUE INDEX "ProductPriceCache_manufacturer_partNumber_key" ON "ProductPriceCache"("manufacturer", "partNumber");

-- AddForeignKey
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
