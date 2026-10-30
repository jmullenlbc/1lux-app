-- 0146 Submittal Tracker clean up (Mike 10-29). Additive only.
-- Items, submissions and reviews are archived, never deleted. A response can
-- be marked Sent. Review statuses become Approved, Approved as noted,
-- Rejected, Not reviewed (old Resubmit and No Action rows are renamed).
ALTER TABLE "SubmittalItem" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "SubmittalSubmission" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "SubmittalReview" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "SubmittalResponse" ADD COLUMN "sentAt" TIMESTAMP(3);
UPDATE "SubmittalReview" SET "status" = 'Rejected' WHERE "status" = 'Resubmit';
UPDATE "SubmittalReview" SET "status" = 'NotReviewed' WHERE "status" = 'NoAction';
