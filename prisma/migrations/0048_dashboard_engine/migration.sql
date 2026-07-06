-- Cross-department dashboard engine: sections, admin-default vs per-user ownership,
-- chart type + field-picker dataSpec on widgets, and dashboard sharing. All additive.

ALTER TABLE "Dashboard" ADD COLUMN IF NOT EXISTS "section"     TEXT NOT NULL DEFAULT 'SALES';
ALTER TABLE "Dashboard" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
CREATE INDEX IF NOT EXISTS "Dashboard_section_ownerUserId_idx" ON "Dashboard"("section", "ownerUserId");
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardWidget" ADD COLUMN IF NOT EXISTS "chartType" TEXT NOT NULL DEFAULT 'BAR';
ALTER TABLE "DashboardWidget" ADD COLUMN IF NOT EXISTS "dataSpec"  TEXT;

CREATE TABLE IF NOT EXISTS "DashboardShare" (
  "id"               TEXT NOT NULL,
  "dashboardId"      TEXT NOT NULL,
  "sharedWithUserId" TEXT NOT NULL,
  "createdById"      TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DashboardShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DashboardShare_dashboardId_sharedWithUserId_key" ON "DashboardShare"("dashboardId", "sharedWithUserId");
CREATE INDEX IF NOT EXISTS "DashboardShare_sharedWithUserId_idx" ON "DashboardShare"("sharedWithUserId");
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_dashboardId_fkey"      FOREIGN KEY ("dashboardId")      REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "User"("id")      ON DELETE CASCADE ON UPDATE CASCADE;
