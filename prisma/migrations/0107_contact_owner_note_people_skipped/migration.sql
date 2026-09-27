-- My Desk flags (Mike 9-26): people nobody owns, and in-person meetings with
-- guests who are not in the CRM. Additive only.
--   ClientContact.ownerId  who looks after the person; beats the company owner.
--   Note.peopleSkippedAt   "Nobody to add" was pressed on the meeting's flag.

ALTER TABLE "ClientContact" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "ClientContact_ownerId_idx" ON "ClientContact"("ownerId");
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Note" ADD COLUMN "peopleSkippedAt" TIMESTAMP(3);
