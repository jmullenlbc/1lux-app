-- AddColumn (additive only)
--
-- A news source now says which town it reports from. Twenty of the first
-- twenty-one sources were national trade press, which names companies and not
-- buildings — so zero of 191 collected articles ever named one of our jobs.
-- Knowing a source's market is what makes "do we have coverage in Houston?"
-- a question with an answer.
--
-- Postgres syntax, to match the rest of this folder — migrations only ever run
-- against Postgres (Amplify rewrites the provider and runs `migrate deploy`);
-- local SQLite is kept in step with `prisma db push`.
ALTER TABLE "MarketSource" ADD COLUMN IF NOT EXISTS "market" TEXT NOT NULL DEFAULT 'NATIONAL';

-- The one source that was already local. Everything else keeps the default,
-- which is the truth about it.
UPDATE "MarketSource" SET "market" = 'DENVER' WHERE "name" = 'Mile High CRE';

CREATE INDEX IF NOT EXISTS "MarketSource_market_idx" ON "MarketSource"("market");
