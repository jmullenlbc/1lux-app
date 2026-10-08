-- 0125: screen out articles that are not about a project (Mike 10-8: "if it's
-- not project related we don't need it"). Additive only. null = not screened
-- yet; the "Screen articles" button on Sources works through those.
ALTER TABLE "MarketSignal" ADD COLUMN "projectRelated" BOOLEAN;

CREATE INDEX "MarketSignal_kind_projectRelated_idx" ON "MarketSignal"("kind", "projectRelated");

-- A permit is a building by definition.
UPDATE "MarketSignal" SET "projectRelated" = true WHERE "kind" = 'PERMIT';
