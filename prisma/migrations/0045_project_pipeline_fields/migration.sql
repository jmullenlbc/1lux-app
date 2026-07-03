-- Merge pipeline / CRM fields onto Project — a project IS the pipeline entity
-- (single source of truth across budgets, pipeline, and CRM). Board membership is
-- derived from serviceType; revenue reuses contractValue (Product Sale Total) +
-- designContractValue (Design Fee Total). All additive, all with safe defaults.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "projectType"         TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "procurementStage"    TEXT    NOT NULL DEFAULT 'QUALIFIED';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "designStage"         TEXT    NOT NULL DEFAULT 'DESIGN_QUALIFIED';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "pipelineProbability" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "procurementStatus"   TEXT    NOT NULL DEFAULT 'OPEN';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "designStatus"        TEXT    NOT NULL DEFAULT 'OPEN';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "expectedOrderDate"   TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "salesOwnerId"        TEXT;

-- Sales Owner FK (the one project owner across the platform)
ALTER TABLE "Project" ADD CONSTRAINT "Project_salesOwnerId_fkey"
  FOREIGN KEY ("salesOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (1b): stages default to QUALIFIED (drag from there). Derive pipeline
-- status from the project — a signed supply contract means the product sale is Won.
UPDATE "Project" SET "procurementStatus" = 'WON'
  WHERE "contractSignedDate" IS NOT NULL AND "contractSignedDate" <> '';
UPDATE "Project" SET "designStatus" = 'WON'
  WHERE "designContractSignedDate" IS NOT NULL AND "designContractSignedDate" <> '';
-- Seed the sales owner from the project creator where unset (one-time, editable after).
UPDATE "Project" SET "salesOwnerId" = "createdById" WHERE "salesOwnerId" IS NULL;
