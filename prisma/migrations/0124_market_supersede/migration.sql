-- 0124: one building, one count. A permit supersedes a concept plan supersedes
-- an article. Additive only.
ALTER TABLE "MarketSignal" ADD COLUMN "supersededById" TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN "supersededAt" TIMESTAMP(3);
ALTER TABLE "MarketSignal" ADD COLUMN "supersedeReviewed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "MarketSignal_supersededById_idx" ON "MarketSignal"("supersededById");

ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "MarketSignal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
