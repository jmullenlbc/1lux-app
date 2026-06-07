-- Sales Bot + Automation Phase A
-- Adds: BotConfig, SchedulingRule, BotDraft, BotRule, MessageTemplate, BotKnowledgeEntry, UserLocationState
-- Adds homeBaseCity, homeBaseAddress to User
-- Adds botDrafts backrelation on Deal (no SQL needed — Prisma handles)

ALTER TABLE "User" ADD COLUMN "homeBaseCity"    TEXT;
ALTER TABLE "User" ADD COLUMN "homeBaseAddress" TEXT;

CREATE TABLE "BotConfig" (
  "id"                   TEXT NOT NULL PRIMARY KEY,
  "userId"               TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "schedulingEnabled"    BOOLEAN NOT NULL DEFAULT false,
  "followUpEnabled"      BOOLEAN NOT NULL DEFAULT false,
  "reviewWindowMinutes"  INTEGER NOT NULL DEFAULT 30,
  "proposalCount"        INTEGER NOT NULL DEFAULT 3,
  "confirmationMessage"  TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL
);

CREATE TABLE "SchedulingRule" (
  "id"                   TEXT NOT NULL PRIMARY KEY,
  "userId"               TEXT REFERENCES "User"("id") ON DELETE CASCADE,
  "meetingType"          TEXT NOT NULL,
  "dealStage"            TEXT,
  "preferredDaysOfWeek"  TEXT NOT NULL DEFAULT '["MON","TUE","WED","THU","FRI"]',
  "preferredStartTime"   TEXT NOT NULL DEFAULT '09:00',
  "preferredEndTime"     TEXT NOT NULL DEFAULT '17:00',
  "bufferBeforeMinutes"  INTEGER NOT NULL DEFAULT 15,
  "bufferAfterMinutes"   INTEGER NOT NULL DEFAULT 15,
  "durationMinutes"      INTEGER NOT NULL DEFAULT 60,
  "locationType"         TEXT NOT NULL DEFAULT 'IN_OFFICE',
  "homeBase"             TEXT,
  "travelCity"           TEXT,
  "travelBufferMinutes"  INTEGER NOT NULL DEFAULT 45,
  "priority"             INTEGER NOT NULL DEFAULT 0,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SchedulingRule_userId_idx" ON "SchedulingRule"("userId");

CREATE TABLE "BotDraft" (
  "id"                   TEXT NOT NULL PRIMARY KEY,
  "userId"               TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "dealId"               TEXT REFERENCES "Deal"("id") ON DELETE SET NULL,
  "emailThreadId"        TEXT,
  "type"                 TEXT NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "toEmail"              TEXT NOT NULL,
  "toName"               TEXT,
  "subject"              TEXT NOT NULL,
  "body"                 TEXT NOT NULL,
  "proposedSlots"        TEXT,
  "confirmedSlot"        TEXT,
  "calendarEventId"      TEXT,
  "reviewWindowMinutes"  INTEGER NOT NULL DEFAULT 30,
  "reviewExpiresAt"      TIMESTAMP(3),
  "sentAt"               TIMESTAMP(3),
  "cancelledAt"          TIMESTAMP(3),
  "editedByUserId"       TEXT,
  "intentConfidence"     REAL,
  "draftModel"           TEXT,
  "classificationReason" TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BotDraft_userId_idx"  ON "BotDraft"("userId");
CREATE INDEX "BotDraft_dealId_idx"  ON "BotDraft"("dealId");
CREATE INDEX "BotDraft_status_idx"  ON "BotDraft"("status");

CREATE TABLE "BotRule" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "name"            TEXT NOT NULL,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "triggerType"     TEXT NOT NULL,
  "triggerConfig"   TEXT NOT NULL DEFAULT '{}',
  "actionType"      TEXT NOT NULL,
  "actionConfig"    TEXT NOT NULL DEFAULT '{}',
  "appliesTo"       TEXT NOT NULL DEFAULT 'ALL_SALES',
  "executionOrder"  INTEGER NOT NULL DEFAULT 0,
  "parentRuleId"    TEXT REFERENCES "BotRule"("id"),
  "createdById"     TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BotRule_triggerType_idx" ON "BotRule"("triggerType");
CREATE INDEX "BotRule_isActive_idx"    ON "BotRule"("isActive");

CREATE TABLE "MessageTemplate" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "channel"     TEXT NOT NULL,
  "scenario"    TEXT NOT NULL,
  "dealStage"   TEXT,
  "clientType"  TEXT,
  "subject"     TEXT,
  "body"        TEXT NOT NULL,
  "variables"   TEXT NOT NULL DEFAULT '[]',
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL REFERENCES "User"("id"),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);
CREATE INDEX "MessageTemplate_channel_idx"  ON "MessageTemplate"("channel");
CREATE INDEX "MessageTemplate_scenario_idx" ON "MessageTemplate"("scenario");

CREATE TABLE "BotKnowledgeEntry" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "category"    TEXT NOT NULL,
  "keywords"    TEXT NOT NULL,
  "question"    TEXT NOT NULL,
  "answer"      TEXT NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "source"      TEXT,
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BotKnowledgeEntry_category_idx" ON "BotKnowledgeEntry"("category");

CREATE TABLE "UserLocationState" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "userId"           TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "date"             TEXT NOT NULL,
  "city"             TEXT NOT NULL,
  "detectedFrom"     TEXT NOT NULL,
  "calendarEventId"  TEXT,
  "confidence"       REAL,
  "overriddenByUser" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  UNIQUE("userId", "date")
);
CREATE INDEX "UserLocationState_userId_idx" ON "UserLocationState"("userId");
