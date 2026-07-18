-- Weekly sales-meeting operational signals on Project (additive). Powers the
-- "Awaiting signature" (proposalSentDate) and "Next actions due" (nextAction*) queues.
-- Note: the new Procurement "Buyout" stage needs no schema change — procurementStage
-- is a free-text column.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "proposalSentDate"  TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "nextActionType"    TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "nextActionOwnerId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "nextActionDueDate" TIMESTAMP(3);
