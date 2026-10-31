-- Manual discount on a change order option. Additive only.
ALTER TABLE "ChangeOrderOptionGroup"
  ADD COLUMN "discountAmount" DOUBLE PRECISION,
  ADD COLUMN "discountPct" DOUBLE PRECISION,
  ADD COLUMN "discountNote" TEXT;
