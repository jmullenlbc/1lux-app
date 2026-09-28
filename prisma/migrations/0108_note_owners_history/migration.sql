-- Shared sales notes (Mike 9-27). Additive only.
--   NoteOwner               every salesperson on the meeting owns the note
--   NoteAction.leadUserId   who does the step; null = every owner
--   BotDraft.senderPending  a shared note's email waits until a sender is picked
--   NoteChange              the note's change history
-- Backfill: each note's creator becomes its first owner.

CREATE TABLE "NoteOwner" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteOwner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NoteOwner_noteId_userId_key" ON "NoteOwner"("noteId", "userId");
CREATE INDEX "NoteOwner_userId_idx" ON "NoteOwner"("userId");
ALTER TABLE "NoteOwner" ADD CONSTRAINT "NoteOwner_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteOwner" ADD CONSTRAINT "NoteOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NoteChange" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "field" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NoteChange_noteId_createdAt_idx" ON "NoteChange"("noteId", "createdAt");
ALTER TABLE "NoteChange" ADD CONSTRAINT "NoteChange_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NoteAction" ADD COLUMN "leadUserId" TEXT;
CREATE INDEX "NoteAction_leadUserId_idx" ON "NoteAction"("leadUserId");
ALTER TABLE "NoteAction" ADD CONSTRAINT "NoteAction_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BotDraft" ADD COLUMN "senderPending" BOOLEAN NOT NULL DEFAULT false;

-- One owner per existing note: its creator. The id only has to be unique.
INSERT INTO "NoteOwner" ("id", "noteId", "userId", "source", "createdAt")
SELECT 'nob_' || "id", "id", "createdById", 'creator', "createdAt"
FROM "Note" WHERE "createdById" IS NOT NULL;
