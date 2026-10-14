-- 0131: units estimated from gross square feet (Mike 10-14: "estimated units
-- we should always do based on gross SF with any location"). A permit, concept
-- plan or council row for housing that states a gross SF but no unit count
-- gets about one unit per 1,000 gross SF; unitsEstimated says the count is a
-- guess, grossSf keeps the figure it came from. Additive only.
ALTER TABLE "MarketSignal" ADD COLUMN "grossSf" INTEGER;
ALTER TABLE "MarketSignal" ADD COLUMN "unitsEstimated" BOOLEAN NOT NULL DEFAULT false;
