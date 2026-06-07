-- CRM Contact model improvements for sales automation
-- Adds: isPrimary + dealRole + dealNotes to DealContact
-- Adds: linkedInUrl + preferredName + company to Contact

ALTER TABLE "DealContact" ADD COLUMN "dealRole"  TEXT;
ALTER TABLE "DealContact" ADD COLUMN "dealNotes" TEXT;
ALTER TABLE "DealContact" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Contact" ADD COLUMN "linkedInUrl"   TEXT;
ALTER TABLE "Contact" ADD COLUMN "preferredName" TEXT;
ALTER TABLE "Contact" ADD COLUMN "company"       TEXT;
