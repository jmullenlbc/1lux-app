-- Migration 0023: Proposals module
-- Adds Proposal, ProposalLineItem, ProposalTemplate, ProposalTemplateTask,
-- ProposalRate, ProposalSend; adds lifecycleStatus to Project.

-- Project: lifecycle status (default ACTIVE so existing rows stay active)
ALTER TABLE "Project" ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

-- Proposal
CREATE TABLE "Proposal" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "projectId"      TEXT NOT NULL,
  "templateId"     TEXT,
  "dealId"         TEXT,
  "type"           TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'DRAFT',
  "title"          TEXT NOT NULL,
  "clientName"     TEXT,
  "clientLegalName" TEXT,
  "location"       TEXT,
  "effectiveDate"  DATETIME,
  "docBody"        TEXT NOT NULL DEFAULT '',
  "calculatedFee"  REAL NOT NULL DEFAULT 0,
  "overrideFee"    REAL,
  "overrideActive" BOOLEAN NOT NULL DEFAULT 0,
  "adderPct"       REAL NOT NULL DEFAULT 10,
  "milestoneSplit" TEXT,
  "rateSnapshot"   TEXT NOT NULL DEFAULT '{}',
  "sentAt"         DATETIME,
  "acceptedAt"     DATETIME,
  "declinedAt"     DATETIME,
  "createdById"    TEXT NOT NULL,
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      DATETIME NOT NULL,
  CONSTRAINT "Proposal_projectId_fkey"  FOREIGN KEY ("projectId")  REFERENCES "Project"("id")  ON DELETE CASCADE,
  CONSTRAINT "Proposal_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProposalTemplate"("id") ON DELETE SET NULL,
  CONSTRAINT "Proposal_dealId_fkey"     FOREIGN KEY ("dealId")     REFERENCES "Deal"("id")     ON DELETE SET NULL,
  CONSTRAINT "Proposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id")
);

-- ProposalLineItem
CREATE TABLE "ProposalLineItem" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "proposalId"     TEXT NOT NULL,
  "area"           TEXT NOT NULL,
  "task"           TEXT NOT NULL,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "srHours"        REAL NOT NULL DEFAULT 0,
  "designerHours"  REAL NOT NULL DEFAULT 0,
  "salesHours"     REAL NOT NULL DEFAULT 0,
  "outsourceHours" REAL NOT NULL DEFAULT 0,
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      DATETIME NOT NULL,
  CONSTRAINT "ProposalLineItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE
);

-- ProposalTemplate
CREATE TABLE "ProposalTemplate" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "projectType"    TEXT,
  "clientType"     TEXT,
  "docBody"        TEXT NOT NULL DEFAULT '',
  "milestoneSplit" TEXT,
  "defaultAdderPct" REAL NOT NULL DEFAULT 10,
  "exclusions"     TEXT,
  "scopeMatrixRef" TEXT,
  "isDefault"      BOOLEAN NOT NULL DEFAULT 0,
  "isActive"       BOOLEAN NOT NULL DEFAULT 1,
  "createdById"    TEXT NOT NULL,
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      DATETIME NOT NULL,
  CONSTRAINT "ProposalTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id")
);

-- ProposalTemplateTask
CREATE TABLE "ProposalTemplateTask" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "templateId"     TEXT NOT NULL,
  "area"           TEXT NOT NULL,
  "task"           TEXT NOT NULL,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "srHours"        REAL NOT NULL DEFAULT 0,
  "designerHours"  REAL NOT NULL DEFAULT 0,
  "salesHours"     REAL NOT NULL DEFAULT 0,
  "outsourceHours" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "ProposalTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProposalTemplate"("id") ON DELETE CASCADE
);

-- ProposalRate
CREATE TABLE "ProposalRate" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "role"        TEXT NOT NULL,
  "hourlyRate"  REAL NOT NULL,
  "updatedAt"   DATETIME NOT NULL,
  "updatedById" TEXT,
  CONSTRAINT "ProposalRate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "ProposalRate_role_key" ON "ProposalRate"("role");

-- ProposalSend
CREATE TABLE "ProposalSend" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "proposalId"      TEXT NOT NULL,
  "sentToEmails"    TEXT NOT NULL,
  "note"            TEXT,
  "docBodySnapshot" TEXT,
  "sentById"        TEXT NOT NULL,
  "sentAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProposalSend_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE,
  CONSTRAINT "ProposalSend_sentById_fkey"   FOREIGN KEY ("sentById")   REFERENCES "User"("id")
);
