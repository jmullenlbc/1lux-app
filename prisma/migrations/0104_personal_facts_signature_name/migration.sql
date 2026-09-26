-- Signature name + office line, and personal facts about people (Mike 9-26).
-- Additive only: three nullable User columns and one new table.

ALTER TABLE "User" ADD COLUMN "signatureName" TEXT;
ALTER TABLE "User" ADD COLUMN "officePhone" TEXT;
ALTER TABLE "User" ADD COLUMN "officeExt" TEXT;

CREATE TABLE "ContactPersonalFact" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "sourceNoteId" TEXT,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContactPersonalFact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContactPersonalFact_contactId_archivedAt_idx" ON "ContactPersonalFact"("contactId", "archivedAt");
CREATE INDEX "ContactPersonalFact_sourceNoteId_idx" ON "ContactPersonalFact"("sourceNoteId");
ALTER TABLE "ContactPersonalFact" ADD CONSTRAINT "ContactPersonalFact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactPersonalFact" ADD CONSTRAINT "ContactPersonalFact_sourceNoteId_fkey" FOREIGN KEY ("sourceNoteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactPersonalFact" ADD CONSTRAINT "ContactPersonalFact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactPersonalFact" ADD CONSTRAINT "ContactPersonalFact_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
