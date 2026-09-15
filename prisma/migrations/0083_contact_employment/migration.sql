-- 0083: a person's work history (Mike, 2026-09-14: "meeting prep should pull in
-- the person's Linkedin resume with years worked at places").
--
-- One row per job they have held: company, title, start and end (year, and the
-- month when known), and whether it is their job now. Filled from text a
-- salesperson pastes off the person's LinkedIn profile (source 'linkedin_paste'),
-- or typed by hand (source 'manual'). LinkedIn itself is never read by the app.
--
-- Archived, never deleted: a fresh paste archives the old pasted rows and adds
-- new ones, and hand-typed rows are left alone.
--
-- Purely additive: one new table, nothing existing is touched. PostgreSQL.
-- The person table is still called "ClientContact" (model Contact, see 0070).

CREATE TABLE "ContactEmployment" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT,
    "startYear" INTEGER,
    "startMonth" INTEGER,
    "endYear" INTEGER,
    "endMonth" INTEGER,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactEmployment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactEmployment_contactId_idx" ON "ContactEmployment"("contactId");

ALTER TABLE "ContactEmployment" ADD CONSTRAINT "ContactEmployment_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
