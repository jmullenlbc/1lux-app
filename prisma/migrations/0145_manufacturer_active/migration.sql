-- 0145 Manufacturer archive (Mike 10-29). Additive only.
-- active = false hides a manufacturer from the list and the pickers, the same
-- as Sales Reps. Nothing is deleted; Restore brings it back.
ALTER TABLE "Manufacturer" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
