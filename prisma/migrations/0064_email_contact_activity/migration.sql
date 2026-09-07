-- Email activity against a person: the two Last Email fields on the People tab.
--
-- Mike, 2026-09-06: build this now so it is ready when the Microsoft mailbox is
-- connected. A mass email is one with 25 or more people on it; mass emails,
-- calendar invites and replies do not count as real contact with a person.
--
-- Purely additive: new optional columns on an existing table, plus one new link
-- table. Nothing is dropped or renamed, so no existing data is at risk.
-- PostgreSQL syntax throughout.
--
-- IMPORTANT: amplify.yml runs `npx prisma migrate deploy`, so this really does
-- run against production, and a SQL error here HALTS the deploy in a failed
-- migration state (the 0023_proposals precedent). Read it as production code.

-- ── EmailMessage: the addresses we did not store before ─────────────────────
-- Cc and Bcc matter now because they count towards the 25-people rule.
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "ccEmails"  TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "bccEmails" TEXT;

-- ── EmailMessage: the verdict, worked out once at write time ────────────────
-- Stored rather than recomputed so "when did we last really talk to them" is one
-- indexed lookup instead of a scan of the mailbox.
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "peopleCount"      INTEGER;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "isMassEmail"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "isCalendarInvite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "isReplyMessage"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "isAutomated"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "countsAsContact"  BOOLEAN NOT NULL DEFAULT false;

-- Existing rows keep countsAsContact = false. They were seeded before the rules
-- existed and were never run through them; re-syncing the mailbox will set the
-- verdict properly. False is the safe default — it shows no date rather than a
-- wrong one.

CREATE INDEX IF NOT EXISTS "EmailMessage_countsAsContact_sentAt_idx"
  ON "EmailMessage" ("countsAsContact", "sentAt");

-- ── Who was on the email ────────────────────────────────────────────────────
-- One row per person per message. The role separates the two fields: FROM means
-- they wrote to us, To/Cc/Bcc means we wrote to them.
CREATE TABLE IF NOT EXISTS "EmailContactLink" (
  "id"        TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "role"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailContactLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailContactLink_messageId_contactId_key"
  ON "EmailContactLink" ("messageId", "contactId");
CREATE INDEX IF NOT EXISTS "EmailContactLink_contactId_idx"
  ON "EmailContactLink" ("contactId");

ALTER TABLE "EmailContactLink"
  ADD CONSTRAINT "EmailContactLink_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailContactLink"
  ADD CONSTRAINT "EmailContactLink_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
