-- 0140: National companies with local branches (Mike 10-28). Additive only.
--   Client.parentClientId  the national company this branch belongs to (one level)
--   Client.branchMarket    the city or region the branch covers

ALTER TABLE "Client" ADD COLUMN "parentClientId" TEXT;
ALTER TABLE "Client" ADD COLUMN "branchMarket" TEXT;

CREATE INDEX "Client_parentClientId_idx" ON "Client"("parentClientId");

ALTER TABLE "Client" ADD CONSTRAINT "Client_parentClientId_fkey" FOREIGN KEY ("parentClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
