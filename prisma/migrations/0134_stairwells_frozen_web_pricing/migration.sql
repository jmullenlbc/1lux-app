-- 0134: internal tool asks exit stairs and works out landings like the public
-- tool (Mike 10-17), and a sent web budget keeps the price sheet it was
-- priced on. Additive only.
ALTER TABLE "ProjectData" ADD COLUMN "numStairwells" INTEGER;
ALTER TABLE "ConceptualSubmission" ADD COLUMN "pricingSnapshot" TEXT;
