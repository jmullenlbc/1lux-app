-- Batch 1 CRM improvements
-- SalesNote: isPublished (draft until published — no automations on drafts)
-- SchedulingRule: isActive (soft disable instead of hard delete)

ALTER TABLE "SalesNote" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesNote" ADD COLUMN "publishedAt"  TIMESTAMP(3);

-- Calendar-imported notes are auto-published (they came from accepted events)
UPDATE "SalesNote" SET "isPublished" = true, "publishedAt" = "createdAt"
WHERE "calendarRef" IS NOT NULL;

ALTER TABLE "SchedulingRule" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
