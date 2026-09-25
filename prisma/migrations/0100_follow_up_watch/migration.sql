-- Follow-up watch (Mike 2026-09-25).
--
-- After a sales meeting the bot now watches for the things people said they
-- would do: reply, send drawings, send an invite, make an intro. When a
-- matching email or invite arrives the step is marked done and points at it.
-- When nothing arrives, reminders run on a ladder of up to three rungs,
-- editable per step type (Sales Automation -> Reminder timeline).
-- Additive only — no existing column changes, no rows removed.

ALTER TABLE "NoteActionType" ADD COLUMN "reminder2Days" INTEGER;
ALTER TABLE "NoteActionType" ADD COLUMN "reminder3Days" INTEGER;

ALTER TABLE "NoteAction" ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NoteAction" ADD COLUMN "nudgeDraftId" TEXT;
ALTER TABLE "NoteAction" ADD COLUMN "fulfilledAt" TIMESTAMP(3);
ALTER TABLE "NoteAction" ADD COLUMN "fulfilledVia" TEXT;
ALTER TABLE "NoteAction" ADD COLUMN "fulfilledByEmailId" TEXT;
ALTER TABLE "NoteAction" ADD COLUMN "fulfilledNote" TEXT;

CREATE INDEX "NoteAction_fulfilledByEmailId_idx" ON "NoteAction"("fulfilledByEmailId");
CREATE INDEX "NoteAction_contactId_status_idx" ON "NoteAction"("contactId", "status");

ALTER TABLE "NoteAction" ADD CONSTRAINT "NoteAction_fulfilledByEmailId_fkey"
    FOREIGN KEY ("fulfilledByEmailId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The three new waiting step types. Inserted only where missing, so an admin's
-- own row with the same key is never touched.
INSERT INTO "NoteActionType" ("key", "label", "executor", "kind", "description", "reminderDays", "reminder2Days", "reminder3Days", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'EXPECT_REPLY', 'Expect a reply', 'EXPECT_REPLY', 'ACTION',
       'They said they would get back to me — watch email for their reply, remind if it does not come.',
       14, 30, 60, 52, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "NoteActionType" WHERE "key" = 'EXPECT_REPLY');

INSERT INTO "NoteActionType" ("key", "label", "executor", "kind", "description", "reminderDays", "reminder2Days", "reminder3Days", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'EXPECT_DRAWINGS', 'Expect drawings / files', 'EXPECT_FILES', 'ACTION',
       'They are sending drawings, plans or files — watch email for them, remind if they do not come.',
       14, 30, 60, 54, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "NoteActionType" WHERE "key" = 'EXPECT_DRAWINGS');

INSERT INTO "NoteActionType" ("key", "label", "executor", "kind", "description", "reminderDays", "reminder2Days", "reminder3Days", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'EXPECT_INVITE', 'Expect an invite', 'EXPECT_INVITE', 'ACTION',
       'They are sending a meeting or calendar invite — watch for it, remind if it does not come.',
       14, 30, 60, 56, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "NoteActionType" WHERE "key" = 'EXPECT_INVITE');

-- Intros already wait 7 days; give them a second and third rung.
UPDATE "NoteActionType" SET "reminder2Days" = 14, "reminder3Days" = 30
WHERE "executor" = 'EXPECT_INTRO' AND "reminder2Days" IS NULL AND "reminder3Days" IS NULL;
