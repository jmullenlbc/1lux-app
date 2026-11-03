-- A rep price reaches the bid matrix or CO line only after a person approves
-- it. Additive only. Existing lines start not approved.
ALTER TABLE "RfqLine" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "RfqLine" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "RfqLine" ADD COLUMN "approvedByName" TEXT;
