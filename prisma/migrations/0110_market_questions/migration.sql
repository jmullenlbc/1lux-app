-- Market Intel "ask any market question" (Mike 9-27). Additive only.
--   MarketQuestion        one question asked, who asked, the short answer
--   MarketAnswerRow       one company (or item) in the answer, ranked, with an
--                         optional link to the CRM company it matches
--   MarketAnswerYear      units by year for a row (last 3 years)
--   MarketAnswerSource    web pages the answer came from

CREATE TABLE "MarketQuestion" (
    "id" TEXT NOT NULL,
    "askedById" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "answerKind" TEXT,
    "metro" TEXT,
    "summary" TEXT,
    "error" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "MarketQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketQuestion_createdAt_idx" ON "MarketQuestion"("createdAt");

CREATE TABLE "MarketAnswerRow" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "companyName" TEXT NOT NULL,
    "role" TEXT,
    "city" TEXT,
    "state" TEXT,
    "unitsTotal" INTEGER,
    "yearNote" TEXT,
    "detail" TEXT,
    "clientId" TEXT,
    "matchStatus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketAnswerRow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketAnswerRow_questionId_rank_idx" ON "MarketAnswerRow"("questionId", "rank");
CREATE INDEX "MarketAnswerRow_clientId_idx" ON "MarketAnswerRow"("clientId");

CREATE TABLE "MarketAnswerYear" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "units" INTEGER NOT NULL,
    CONSTRAINT "MarketAnswerYear_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketAnswerYear_rowId_year_key" ON "MarketAnswerYear"("rowId", "year");

CREATE TABLE "MarketAnswerSource" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "rowId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT,
    CONSTRAINT "MarketAnswerSource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketAnswerSource_questionId_idx" ON "MarketAnswerSource"("questionId");

ALTER TABLE "MarketQuestion" ADD CONSTRAINT "MarketQuestion_askedById_fkey" FOREIGN KEY ("askedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketAnswerRow" ADD CONSTRAINT "MarketAnswerRow_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "MarketQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketAnswerRow" ADD CONSTRAINT "MarketAnswerRow_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketAnswerYear" ADD CONSTRAINT "MarketAnswerYear_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "MarketAnswerRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketAnswerSource" ADD CONSTRAINT "MarketAnswerSource_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "MarketQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketAnswerSource" ADD CONSTRAINT "MarketAnswerSource_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "MarketAnswerRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
