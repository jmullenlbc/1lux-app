-- 0118: everything that waits on the email and calendar sync, built ahead of
-- the feed (Mike and Maram, 2026-10-05: sync live in November). Additive only.

-- A person we do not know, introduced on an email or an invite where a known
-- contact is on it too. Confirming makes the Contact. Archive-only.
CREATE TABLE "Introduction" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "introducedContactId" TEXT,
    "introducedEmail" TEXT NOT NULL,
    "introducedName" TEXT,
    "introducedByContactId" TEXT,
    "introducedByUserId" TEXT,
    "clientId" TEXT,
    "sourceMessageId" TEXT,
    "sourceCalendarRef" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Introduction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Introduction_status_idx" ON "Introduction"("status");
CREATE INDEX "Introduction_introducedEmail_idx" ON "Introduction"("introducedEmail");
CREATE INDEX "Introduction_sourceMessageId_idx" ON "Introduction"("sourceMessageId");
ALTER TABLE "Introduction" ADD CONSTRAINT "Introduction_introducedContactId_fkey" FOREIGN KEY ("introducedContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Introduction" ADD CONSTRAINT "Introduction_introducedByContactId_fkey" FOREIGN KEY ("introducedByContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Introduction" ADD CONSTRAINT "Introduction_introducedByUserId_fkey" FOREIGN KEY ("introducedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Introduction" ADD CONSTRAINT "Introduction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Introduction" ADD CONSTRAINT "Introduction_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Introduction" ADD CONSTRAINT "Introduction_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Email tags as rows (the old EmailMessage.tags JSON string stays as it is).
CREATE TABLE "EmailTag" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailTag_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "EmailMessageTag" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "tagKey" TEXT NOT NULL,
    "taggedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailMessageTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailMessageTag_messageId_tagKey_key" ON "EmailMessageTag"("messageId", "tagKey");
CREATE INDEX "EmailMessageTag_tagKey_idx" ON "EmailMessageTag"("tagKey");
ALTER TABLE "EmailMessageTag" ADD CONSTRAINT "EmailMessageTag_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessageTag" ADD CONSTRAINT "EmailMessageTag_tagKey_fkey" FOREIGN KEY ("tagKey") REFERENCES "EmailTag"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailMessageTag" ADD CONSTRAINT "EmailMessageTag_taggedById_fkey" FOREIGN KEY ("taggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "EmailTag" ("key", "label", "color", "sortOrder", "isActive", "createdAt")
SELECT 'BLOCKER', 'Blocker', '#dc2626', 10, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "EmailTag" WHERE "key" = 'BLOCKER');
INSERT INTO "EmailTag" ("key", "label", "color", "sortOrder", "isActive", "createdAt")
SELECT 'ISSUE', 'Issue', '#d97706', 20, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "EmailTag" WHERE "key" = 'ISSUE');
INSERT INTO "EmailTag" ("key", "label", "color", "sortOrder", "isActive", "createdAt")
SELECT 'DECISION_NEEDED', 'Decision needed', '#7c3aed', 30, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "EmailTag" WHERE "key" = 'DECISION_NEEDED');
INSERT INTO "EmailTag" ("key", "label", "color", "sortOrder", "isActive", "createdAt")
SELECT 'GOOD_NEWS', 'Good news', '#059669', 40, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "EmailTag" WHERE "key" = 'GOOD_NEWS');
INSERT INTO "EmailTag" ("key", "label", "color", "sortOrder", "isActive", "createdAt")
SELECT 'FOLLOW_UP', 'Follow up', '#2563eb', 50, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "EmailTag" WHERE "key" = 'FOLLOW_UP');

-- What an email signature says about a person when it differs from what we
-- have (Mike: fill blanks only, never overwrite, a difference is a question).
CREATE TABLE "ContactFieldSuggestion" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "currentValue" TEXT,
    "suggestedValue" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactFieldSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContactFieldSuggestion_contactId_field_suggestedValue_key" ON "ContactFieldSuggestion"("contactId", "field", "suggestedValue");
CREATE INDEX "ContactFieldSuggestion_status_idx" ON "ContactFieldSuggestion"("status");
ALTER TABLE "ContactFieldSuggestion" ADD CONSTRAINT "ContactFieldSuggestion_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactFieldSuggestion" ADD CONSTRAINT "ContactFieldSuggestion_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactFieldSuggestion" ADD CONSTRAINT "ContactFieldSuggestion_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LinkedIn has no API we can use, so looking someone up is a task for a person.
INSERT INTO "NoteActionType" ("key", "label", "executor", "kind", "description", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'LINKEDIN', 'Look up on LinkedIn', 'INTERNAL_TASK', 'ACTION',
       'Find or check this person on LinkedIn and paste the profile link into the CRM.',
       58, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "NoteActionType" WHERE "key" = 'LINKEDIN');
