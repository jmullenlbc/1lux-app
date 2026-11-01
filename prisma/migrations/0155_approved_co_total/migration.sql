-- Approved change orders added up, kept beside the Original Contract so dashboards can
-- show Current Contract without loading every change order line.
ALTER TABLE "Project" ADD COLUMN "approvedCoTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
