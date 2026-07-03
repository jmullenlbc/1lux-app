-- Playbook v3 (Option B — fully queryable). Drop the JSON bins, normalize into
-- tables, add intro/logistics/comms scalars. No data to migrate (app has none yet).

-- ClientPlaybook: drop JSON bins
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "architectRel";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "eeRel";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "gcRel";
ALTER TABLE "ClientPlaybook" DROP COLUMN IF EXISTS "roleAssignments";

-- ClientPlaybook: new scalars
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "introOwnerContactId" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "introOwnerNote" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "onVendorList" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "vendorListNote" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "pipelineFeed" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "introNotes" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "commsPosture" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "storageDuration" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "receivingPartyContactId" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "receivingPartyNote" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "freightWarehousing" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "damageInventory" TEXT;
ALTER TABLE "ClientPlaybook" ADD COLUMN IF NOT EXISTS "logisticsNotes" TEXT;

-- PlaybookRelationship
CREATE TABLE "PlaybookRelationship" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "exists" BOOLEAN NOT NULL DEFAULT false,
  "firm" TEXT,
  "contactId" TEXT,
  "introStatus" TEXT,
  "gcModel" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlaybookRelationship_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlaybookRelationship_clientId_kind_key" ON "PlaybookRelationship"("clientId", "kind");
ALTER TABLE "PlaybookRelationship" ADD CONSTRAINT "PlaybookRelationship_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlaybookAssignment
CREATE TABLE "PlaybookAssignment" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "contactId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlaybookAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlaybookAssignment_clientId_role_key" ON "PlaybookAssignment"("clientId", "role");
ALTER TABLE "PlaybookAssignment" ADD CONSTRAINT "PlaybookAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlaybookDistribution
CREATE TABLE "PlaybookDistribution" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "contactId" TEXT,
  "freetextName" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlaybookDistribution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlaybookDistribution_clientId_event_idx" ON "PlaybookDistribution"("clientId", "event");
ALTER TABLE "PlaybookDistribution" ADD CONSTRAINT "PlaybookDistribution_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlaybookNote
CREATE TABLE "PlaybookNote" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlaybookNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlaybookNote_clientId_idx" ON "PlaybookNote"("clientId");
ALTER TABLE "PlaybookNote" ADD CONSTRAINT "PlaybookNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
