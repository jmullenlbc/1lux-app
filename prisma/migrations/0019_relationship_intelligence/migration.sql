-- Relationship Intelligence
-- Adds: cadence tracking to Contact, company cadence to Client,
--       activity type to SalesNote, SalesNoteContact join table,
--       RelationshipCadenceRule and ActivityExclusionRule models

-- Contact: relationship cadence fields
ALTER TABLE "Contact" ADD COLUMN "cadenceTier"      TEXT;
ALTER TABLE "Contact" ADD COLUMN "cadenceDays"      INTEGER;
ALTER TABLE "Contact" ADD COLUMN "lastInPersonAt"   TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "lastTouchpointAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "nextCheckInAt"    TIMESTAMP(3);

-- Client: company-level cadence override
ALTER TABLE "Client" ADD COLUMN "cadenceDays" INTEGER;

-- SalesNote: activity type
ALTER TABLE "SalesNote" ADD COLUMN "activityType" TEXT;
ALTER TABLE "SalesNote" ADD COLUMN "isInPerson"   BOOLEAN NOT NULL DEFAULT false;

-- SalesNoteContact: link notes to specific contacts
CREATE TABLE "SalesNoteContact" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "salesNoteId" TEXT NOT NULL REFERENCES "SalesNote"("id") ON DELETE CASCADE,
  "contactId"   TEXT NOT NULL REFERENCES "Contact"("id") ON DELETE CASCADE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("salesNoteId", "contactId")
);

-- RelationshipCadenceRule: tier-based cadence defaults
CREATE TABLE "RelationshipCadenceRule" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "tier"        TEXT NOT NULL UNIQUE,
  "label"       TEXT NOT NULL,
  "cadenceDays" INTEGER NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);

-- ActivityExclusionRule: filter out mass emails and recurring project meetings
CREATE TABLE "ActivityExclusionRule" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "ruleType"    TEXT NOT NULL,
  "config"      TEXT NOT NULL DEFAULT '{}',
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ActivityExclusionRule_ruleType_idx" ON "ActivityExclusionRule"("ruleType");
