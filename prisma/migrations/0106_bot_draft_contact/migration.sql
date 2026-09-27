-- Check-in emails written a day ahead (Mike 9-26). A draft now says which person
-- it is to, so one is written per person per check-in and My Desk can match it.
-- Additive only: one nullable column, its index and its foreign key.

ALTER TABLE "BotDraft" ADD COLUMN "contactId" TEXT;
CREATE INDEX "BotDraft_contactId_idx" ON "BotDraft"("contactId");
ALTER TABLE "BotDraft" ADD CONSTRAINT "BotDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
