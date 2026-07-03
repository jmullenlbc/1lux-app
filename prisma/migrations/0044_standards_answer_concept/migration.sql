-- Standards concept layer (built on the existing ClientStandardsAnswer model).
CREATE TABLE "StandardsAnswerConcept" (
  "id" TEXT NOT NULL,
  "answerId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "questionKey" TEXT NOT NULL,
  "description" TEXT,
  "imageKey" TEXT,
  "typeCode" TEXT,
  "resolvedSku" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StandardsAnswerConcept_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StandardsAnswerConcept_clientId_questionKey_idx" ON "StandardsAnswerConcept"("clientId", "questionKey");
CREATE INDEX "StandardsAnswerConcept_answerId_idx" ON "StandardsAnswerConcept"("answerId");
ALTER TABLE "StandardsAnswerConcept" ADD CONSTRAINT "StandardsAnswerConcept_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "ClientStandardsAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
