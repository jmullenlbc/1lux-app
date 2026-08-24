-- AddColumn (additive only)
--
-- A market signal can now name a PROJECT, not just a developer. "Trailhead
-- breaks ground" is about a job; linking it only to the client leaves the
-- question "any news on The Approach?" unanswerable.
--
-- Postgres syntax, to match the rest of this folder — migrations only ever run
-- against Postgres (Amplify rewrites the provider and runs `migrate deploy`);
-- local SQLite is kept in step with `prisma db push`.
ALTER TABLE "MarketSignal" ADD COLUMN IF NOT EXISTS "linkedProjectId"    TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN IF NOT EXISTS "projectMatchStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED';
ALTER TABLE "MarketSignal" ADD COLUMN IF NOT EXISTS "projectMatchScore"  DOUBLE PRECISION;

-- SetNull on delete: losing a project must never delete the news about it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MarketSignal_linkedProjectId_fkey'
  ) THEN
    ALTER TABLE "MarketSignal"
      ADD CONSTRAINT "MarketSignal_linkedProjectId_fkey"
      FOREIGN KEY ("linkedProjectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MarketSignal_linkedProjectId_idx" ON "MarketSignal"("linkedProjectId");
