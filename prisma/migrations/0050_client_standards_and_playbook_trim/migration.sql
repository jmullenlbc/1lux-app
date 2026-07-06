-- Client standards: product-options approval funnel + client standard fixture schedule.
-- Playbook trim: payment terms moved to Client; dormant playbook columns dropped;
-- standing-relationships model removed (kept only what real client discussions cover).

-- ── Product Options (the "Alternate Options" approval funnel) ─────────────────
CREATE TABLE IF NOT EXISTS "ClientProductOption" (
  "id"            TEXT NOT NULL,
  "clientId"      TEXT NOT NULL,
  "category"      TEXT NOT NULL DEFAULT '',
  "name"          TEXT NOT NULL DEFAULT '',
  "imageKey"      TEXT,
  "productUrl"    TEXT,
  "notes"         TEXT,
  "priceEstimate" DOUBLE PRECISION,
  "priceTarget"   DOUBLE PRECISION,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientProductOption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClientProductOption_clientId_category_idx" ON "ClientProductOption"("clientId", "category");
ALTER TABLE "ClientProductOption" ADD CONSTRAINT "ClientProductOption_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Client Standard Fixture Schedule ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ClientStandardFixture" (
  "id"            TEXT NOT NULL,
  "clientId"      TEXT NOT NULL,
  "typeCode"      TEXT NOT NULL DEFAULT '',
  "location"      TEXT NOT NULL DEFAULT '',
  "description"   TEXT NOT NULL DEFAULT '',
  "imageKey"      TEXT,
  "priceTarget"   DOUBLE PRECISION,
  "productUrl"    TEXT,
  "manufacturer"  TEXT,
  "catalogNumber" TEXT,
  "finish"        TEXT,
  "cct"           TEXT,
  "lumens"        TEXT,
  "wattage"       TEXT,
  "voltage"       TEXT,
  "dimming"       TEXT,
  "mounting"      TEXT,
  "notes"         TEXT,
  "optionId"      TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientStandardFixture_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClientStandardFixture_clientId_idx" ON "ClientStandardFixture"("clientId");
ALTER TABLE "ClientStandardFixture" ADD CONSTRAINT "ClientStandardFixture_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Payment terms → Client (moved off Playbook), backfilled before the drop ───
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
UPDATE "Client" c SET "paymentTerms" = p."paymentTerms"
  FROM "ClientPlaybook" p
  WHERE p."clientId" = c."id" AND p."paymentTerms" IS NOT NULL AND c."paymentTerms" IS NULL;

-- ── Drop dormant playbook columns (not grounded in real client discussions) ───
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "costTierNotes";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "primaryContactId";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "approverContactId";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "coTolerance";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "mgmtStructure";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "hasDesignTeam";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "paymentTerms";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "storageDuration";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "receivingPartyContactId";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "receivingPartyNote";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "freightWarehousing";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "damageInventory";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "logisticsNotes";

-- ── Remove standing-relationships model ──────────────────────────────────────
DROP TABLE IF EXISTS "PlaybookRelationship";
