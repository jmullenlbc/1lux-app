-- 0126: look the owner up on the web when a permit does not name one (Mike
-- 10-8: "if the permit doesn't say a client, our system should be smart enough
-- to quickly search the web"). Additive only. ownerLookupAt null = not looked
-- up yet; set on every attempt, found or not, so a permit is searched once.
ALTER TABLE "MarketSignal" ADD COLUMN "ownerLookupAt" TIMESTAMP(3);
ALTER TABLE "MarketSignal" ADD COLUMN "ownerLookupNote" TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN "ownerSourceUrl" TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN "ownerSourceTitle" TEXT;

CREATE INDEX "MarketSignal_kind_ownerLookupAt_idx" ON "MarketSignal"("kind", "ownerLookupAt");
