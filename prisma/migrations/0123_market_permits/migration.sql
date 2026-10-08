-- 0123: Market Intel permits (Mike 10-7). Additive only.
-- A signal is now an ARTICLE or a PERMIT. Permit rows keep the city's own
-- fields (permit number, class, address, valuation, contractor) as columns.
ALTER TABLE "MarketSignal" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ARTICLE';
ALTER TABLE "MarketSignal" ADD COLUMN "permitNumber" TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN "permitClass" TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN "address" TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN "neighborhood" TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN "valuation" DOUBLE PRECISION;
ALTER TABLE "MarketSignal" ADD COLUMN "contractorName" TEXT;
CREATE INDEX "MarketSignal_kind_publishedAt_idx" ON "MarketSignal"("kind", "publishedAt");
CREATE INDEX "MarketSignal_permitNumber_idx" ON "MarketSignal"("permitNumber");
