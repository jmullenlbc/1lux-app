-- AlterTable: SubmittalItemVersion — add auto-flag fields
ALTER TABLE "SubmittalItemVersion" ADD COLUMN "isDiscontinued" BOOLEAN;
ALTER TABLE "SubmittalItemVersion" ADD COLUMN "wetLocationRequired" BOOLEAN;

-- AlterTable: SubmittalReview — add noteCategory + isExtracted + pageNumber
ALTER TABLE "SubmittalReview" ADD COLUMN "noteCategory" TEXT;
ALTER TABLE "SubmittalReview" ADD COLUMN "isExtracted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SubmittalReview" ADD COLUMN "pageNumber" INTEGER;

-- CreateTable: SubmittalOpenItem
CREATE TABLE "SubmittalOpenItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "noteCategory" TEXT NOT NULL,
    "responsibleParty" TEXT NOT NULL,
    "noteText" TEXT NOT NULL,
    "openedRound" INTEGER NOT NULL DEFAULT 1,
    "closedRound" INTEGER,
    "isRepeat" BOOLEAN NOT NULL DEFAULT false,
    "previousItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubmittalOpenItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubmittalOpenItem_projectId_idx" ON "SubmittalOpenItem"("projectId");
CREATE INDEX "SubmittalOpenItem_projectId_typeCode_idx" ON "SubmittalOpenItem"("projectId", "typeCode");

ALTER TABLE "SubmittalOpenItem" ADD CONSTRAINT "SubmittalOpenItem_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
