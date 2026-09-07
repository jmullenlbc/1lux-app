-- CRM Client + People modules (Mike's field specs, 2026-09-06).
--
-- Purely additive: new optional columns and four new tables. Nothing is
-- dropped or renamed, so no existing data is at risk. PostgreSQL syntax
-- throughout.
--
-- IMPORTANT: amplify.yml runs `npx prisma migrate deploy`, so every UPDATE
-- below really does run against production, and a SQL error here HALTS the
-- deploy in a failed-migration state (the 0023_proposals precedent). Read the
-- backfills as production code, not as local convenience.

-- ── Client ───────────────────────────────────────────────────────────────────
-- Client Rating is a free-text placeholder until the scoring equation is set.
ALTER TABLE "Client" ADD COLUMN "rating" TEXT;

-- Developer Type becomes a multi-select; the old single column stays and is
-- kept in sync with the first value so nothing reading it breaks.
ALTER TABLE "Client" ADD COLUMN "developerTypes" TEXT NOT NULL DEFAULT '[]';

-- Escape backslashes then quotes so an odd stored value can never produce
-- invalid JSON that would throw when the app parses the column.
UPDATE "Client"
   SET "developerTypes" = '["' || replace(replace("developerType", '\', '\\'), '"', '\"') || '"]'
 WHERE "developerType" IS NOT NULL
   AND "developerType" <> ''
   AND "developerTypes" = '[]';

-- Client Type becomes a multi-select. Rows that only ever set the old
-- single-select `type` get folded into `orgTypes` so no classification is lost.
UPDATE "Client"
   SET "orgTypes" = CASE "type"
     WHEN 'developer'                 THEN '["Developer"]'
     WHEN 'architect'                 THEN '["Architect"]'
     WHEN 'interiorDesigner'          THEN '["Interior Designer"]'
     WHEN 'generalContractor'         THEN '["General Contractor"]'
     WHEN 'electricalEngineer'        THEN '["Electrical Engineer"]'
     WHEN 'electricalContractor'      THEN '["Electrical Contractor"]'
     WHEN 'clientRep'                 THEN '["Client Rep"]'
     WHEN 'selfPerformingGc'          THEN '["Self-Performing GC"]'
     WHEN 'developerSelfPerformingGc' THEN '["Developer","Self-Performing GC"]'
     ELSE "orgTypes"
   END
 WHERE "orgTypes" IN ('[]', '') OR "orgTypes" IS NULL;

-- ── Project ──────────────────────────────────────────────────────────────────
-- A required note when a deal is marked Lost or Abandoned, one per pipeline.
ALTER TABLE "Project" ADD COLUMN "procurementStatusReason" TEXT;
ALTER TABLE "Project" ADD COLUMN "designStatusReason" TEXT;

-- ── People (ClientContact) ───────────────────────────────────────────────────
ALTER TABLE "ClientContact" ADD COLUMN "firstName" TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "lastName" TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "cellPhone" TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "workPhone" TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "linkedInUrl" TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "lastEmailReceivedAt" TIMESTAMP(3);
ALTER TABLE "ClientContact" ADD COLUMN "lastEmailSentAt" TIMESTAMP(3);

-- The one existing phone number is a work number until someone says otherwise.
UPDATE "ClientContact"
   SET "workPhone" = "phone"
 WHERE "phone" IS NOT NULL AND "phone" <> '' AND "workPhone" IS NULL;

-- Split the stored full name into first / last. Last word is the surname;
-- everything before it is the first (and middle) name. Single-word names get a
-- first name only.
UPDATE "ClientContact"
   SET "firstName" = CASE
         WHEN position(' ' in btrim("name")) = 0 THEN btrim("name")
         ELSE btrim(substring(btrim("name") from 1 for length(btrim("name")) - position(' ' in reverse(btrim("name")))))
       END,
       "lastName" = CASE
         WHEN position(' ' in btrim("name")) = 0 THEN NULL
         ELSE btrim(substring(btrim("name") from length(btrim("name")) - position(' ' in reverse(btrim("name"))) + 2))
       END
 WHERE "name" IS NOT NULL AND btrim("name") <> '' AND "firstName" IS NULL;

-- ── ProjectContact: the person ↔ project link ────────────────────────────────
CREATE TABLE "ProjectContact" (
  "id"        TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "isLead"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectContact_projectId_contactId_key" ON "ProjectContact"("projectId", "contactId");
CREATE INDEX "ProjectContact_contactId_idx" ON "ProjectContact"("contactId");

ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Client tags ──────────────────────────────────────────────────────────────
CREATE TABLE "ClientTag" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientTag_name_key" ON "ClientTag"("name");

CREATE TABLE "ClientTagLink" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "tagId"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientTagLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientTagLink_clientId_tagId_key" ON "ClientTagLink"("clientId", "tagId");
CREATE INDEX "ClientTagLink_tagId_idx" ON "ClientTagLink"("tagId");

ALTER TABLE "ClientTagLink" ADD CONSTRAINT "ClientTagLink_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientTagLink" ADD CONSTRAINT "ClientTagLink_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "ClientTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
