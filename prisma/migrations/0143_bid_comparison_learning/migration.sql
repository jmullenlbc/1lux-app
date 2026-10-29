-- 0139: Bid Comparison learning (Mike 10-22). Additive only.
-- BidLineMark: one staff press on one bid line (Right, Wrong kind, Wrong grade).
-- RuleProposal: a rule change the marks add up to, waiting on a person.

-- CreateTable
CREATE TABLE "BidLineMark" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "typeTag" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "mfr" TEXT NOT NULL DEFAULT '',
    "catalog" TEXT NOT NULL DEFAULT '',
    "kindRead" TEXT,
    "gradeRead" TEXT,
    "gradeBy" TEXT,
    "mark" TEXT NOT NULL,
    "kindShould" TEXT,
    "gradeShould" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidLineMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleProposal" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "kindKey" TEXT,
    "phrase" TEXT,
    "brand" TEXT,
    "grade" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "marks" INTEGER NOT NULL DEFAULT 0,
    "against" INTEGER NOT NULL DEFAULT 0,
    "sample" TEXT NOT NULL DEFAULT '',
    "appliedAs" TEXT NOT NULL DEFAULT '',
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BidLineMark_mark_idx" ON "BidLineMark"("mark");

-- CreateIndex
CREATE INDEX "BidLineMark_createdAt_idx" ON "BidLineMark"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BidLineMark_job_lineKey_userId_key" ON "BidLineMark"("job", "lineKey", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleProposal_key_key" ON "RuleProposal"("key");

-- CreateIndex
CREATE INDEX "RuleProposal_status_idx" ON "RuleProposal"("status");

-- AddForeignKey
ALTER TABLE "BidLineMark" ADD CONSTRAINT "BidLineMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleProposal" ADD CONSTRAINT "RuleProposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
