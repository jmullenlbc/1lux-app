-- CreateTable
CREATE TABLE "AutomationLog" (
    "id" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "eventRef" TEXT,
    "ruleId" TEXT,
    "ruleName" TEXT,
    "actionType" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'FIRED',
    "detail" TEXT,
    "botDraftId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationLog_triggerType_idx" ON "AutomationLog"("triggerType");
CREATE INDEX "AutomationLog_ruleId_idx" ON "AutomationLog"("ruleId");
CREATE INDEX "AutomationLog_botDraftId_idx" ON "AutomationLog"("botDraftId");
CREATE INDEX "AutomationLog_outcome_idx" ON "AutomationLog"("outcome");
