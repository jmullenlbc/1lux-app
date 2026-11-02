-- What was actually paid for a membership in its year. Additive only.
ALTER TABLE "ConferenceMembership" ADD COLUMN "paidCents" INTEGER;
ALTER TABLE "ConferenceMembership" ADD COLUMN "paidOn" TIMESTAMP(3);
