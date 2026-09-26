-- My Desk (Mike 9-26): snooze a reminder to any date, or pause it.
-- Additive only: two nullable columns.

ALTER TABLE "NoteAction" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
ALTER TABLE "NoteAction" ADD COLUMN "pausedAt" TIMESTAMP(3);
