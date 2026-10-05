-- Courtyard "assumed" tag (Mike 10-2): a courtyard nobody measured is priced
-- at 60 ft each (2 poles). The row now says so, so the team can confirm it and
-- the learning tools never treat a standard length as a measured one.
-- false = measured or typed by a person. Additive only.
ALTER TABLE "SiteFeature" ADD COLUMN "lengthAssumed" BOOLEAN NOT NULL DEFAULT false;
