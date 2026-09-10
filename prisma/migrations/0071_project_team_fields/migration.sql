-- Project team: six companies on a job besides the one we are selling to.
--
-- Mike, 2026-09-09: "we have six project team fields and they connect to
-- clients." Developer, General Contractor, Electrical Contractor, Interior
-- Designer, Electrical Engineer, Architect. Every one of them is optional,
-- always -- Mike, same day: "always optional".
--
-- Purely additive. Six nullable columns, six foreign keys, six indexes. No
-- existing column is touched and no row is rewritten, so every project keeps
-- working with all six seats empty until somebody fills them in.
--
-- ON DELETE SET NULL on all six: deleting a company clears its seat on the team
-- and must never take the project with it.

-- Step 1 -- the columns.
ALTER TABLE "Project" ADD COLUMN "developerId" TEXT;
ALTER TABLE "Project" ADD COLUMN "generalContractorId" TEXT;
ALTER TABLE "Project" ADD COLUMN "electricalContractorId" TEXT;
ALTER TABLE "Project" ADD COLUMN "interiorDesignerId" TEXT;
ALTER TABLE "Project" ADD COLUMN "electricalEngineerId" TEXT;
ALTER TABLE "Project" ADD COLUMN "architectId" TEXT;

-- Step 2 -- the foreign keys. Each points at the client list; no filtering by
-- client type, because a developer sometimes acts as their own GC.
ALTER TABLE "Project" ADD CONSTRAINT "Project_developerId_fkey"
  FOREIGN KEY ("developerId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_generalContractorId_fkey"
  FOREIGN KEY ("generalContractorId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_electricalContractorId_fkey"
  FOREIGN KEY ("electricalContractorId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_interiorDesignerId_fkey"
  FOREIGN KEY ("interiorDesignerId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_electricalEngineerId_fkey"
  FOREIGN KEY ("electricalEngineerId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_architectId_fkey"
  FOREIGN KEY ("architectId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 3 -- indexes. A company's Related Projects list reads all six at once, so
-- each one needs to be cheap on its own.
CREATE INDEX "Project_developerId_idx" ON "Project"("developerId");
CREATE INDEX "Project_generalContractorId_idx" ON "Project"("generalContractorId");
CREATE INDEX "Project_electricalContractorId_idx" ON "Project"("electricalContractorId");
CREATE INDEX "Project_interiorDesignerId_idx" ON "Project"("interiorDesignerId");
CREATE INDEX "Project_electricalEngineerId_idx" ON "Project"("electricalEngineerId");
CREATE INDEX "Project_architectId_idx" ON "Project"("architectId");
