-- Add email domain allowlist to Client
ALTER TABLE "Client" ADD COLUMN "emailDomains" TEXT NOT NULL DEFAULT '[]';

-- Add precon manager FK to Project
ALTER TABLE "Project" ADD COLUMN "preconManagerId" TEXT;
ALTER TABLE "Project" ADD CONSTRAINT "Project_preconManagerId_fkey"
  FOREIGN KEY ("preconManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Intake submissions from /start held for ILC review before becoming real projects
CREATE TABLE "ConceptualSubmission" (
  "id"               TEXT NOT NULL,
  "submitterName"    TEXT NOT NULL,
  "submitterEmail"   TEXT NOT NULL,
  "submitterDomain"  TEXT NOT NULL,
  "proposedName"     TEXT NOT NULL,
  "buildingType"     TEXT,
  "rawPayload"       TEXT,
  "fileRefs"         TEXT NOT NULL DEFAULT '[]',
  "duplicateMatchId" TEXT,
  "status"           TEXT NOT NULL DEFAULT 'PENDING',
  "reviewNote"       TEXT,
  "clientId"         TEXT,
  "reviewedById"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConceptualSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConceptualSubmission_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConceptualSubmission_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConceptualSubmission_duplicateMatchId_fkey"
    FOREIGN KEY ("duplicateMatchId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
