-- AlterTable
ALTER TABLE "NoteAction" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "NoteAction" ADD COLUMN "executedAt" TIMESTAMP(3);
ALTER TABLE "NoteAction" ADD COLUMN "remindAt" TIMESTAMP(3);
ALTER TABLE "NoteAction" ADD COLUMN "botDraftId" TEXT;
