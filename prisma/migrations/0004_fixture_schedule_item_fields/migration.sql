-- Restore fields that were dropped from FixtureScheduleItem
ALTER TABLE "FixtureScheduleItem" ADD COLUMN IF NOT EXISTS "isAlternate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FixtureScheduleItem" ADD COLUMN IF NOT EXISTS "alternateOf" TEXT;
ALTER TABLE "FixtureScheduleItem" ADD COLUMN IF NOT EXISTS "aiFlagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FixtureScheduleItem" ADD COLUMN IF NOT EXISTS "aiConfidence" DOUBLE PRECISION;
