-- Deal status history (Mike, 2026-09-08): "We need to record the date a deal was
-- created and that status of won, lost, abandoned, etc. changed."
--
-- The status columns on Project only ever hold where a deal is NOW. The day it
-- was won was never written down anywhere, which is why "Sales Cycle Duration by
-- Owner" has always drawn an empty chart. This table is the missing history.
--
-- One row per BOARD. A Full Design job is won or lost on each board separately
-- (Mike, 2026-09-05: "we can win a design and lose the procurement"), so the
-- procurement close and the design close are two different dates.
--
-- Purely additive: one new table, nothing dropped or renamed. PostgreSQL syntax.
--
-- IMPORTANT: amplify.yml runs `npx prisma migrate deploy`, so the backfill below
-- really runs against production and a SQL error here HALTS the deploy in a
-- failed-migration state. Read it as production code.

CREATE TABLE "ProjectStatusEvent" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "pipeline"     TEXT NOT NULL,
  "fromStatus"   TEXT,
  "toStatus"     TEXT NOT NULL,
  "reason"       TEXT,
  "changedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedById"  TEXT,
  "approximated" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "ProjectStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectStatusEvent_projectId_pipeline_idx" ON "ProjectStatusEvent"("projectId", "pipeline");
CREATE INDEX "ProjectStatusEvent_changedAt_idx" ON "ProjectStatusEvent"("changedAt");

ALTER TABLE "ProjectStatusEvent" ADD CONSTRAINT "ProjectStatusEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectStatusEvent" ADD CONSTRAINT "ProjectStatusEvent_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Every id below is derived from the project id, so re-running this migration
-- can only ever write the same rows: ON CONFLICT DO NOTHING makes it idempotent.

-- 1. The opening row — when the deal was created. This date is REAL: it is the
--    project's own createdAt, not a guess, so approximated stays false.
INSERT INTO "ProjectStatusEvent" ("id", "projectId", "pipeline", "fromStatus", "toStatus", "changedAt", "approximated")
SELECT 'pse_' || md5("id" || ':PROCUREMENT:open'), "id", 'PROCUREMENT', NULL, 'OPEN', "createdAt", false
  FROM "Project"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ProjectStatusEvent" ("id", "projectId", "pipeline", "fromStatus", "toStatus", "changedAt", "approximated")
SELECT 'pse_' || md5("id" || ':DESIGN:open'), "id", 'DESIGN', NULL, 'OPEN', "createdAt", false
  FROM "Project"
 WHERE "serviceType" IN ('fullDesign', 'designAssist')
ON CONFLICT ("id") DO NOTHING;

-- 2. The closing row for deals that are ALREADY past Open. There is no record of
--    when that happened, so updatedAt is the closest thing available — and that
--    is exactly the trap migration 0061 fell into, where an approximated date
--    became indistinguishable from a real one. These rows are therefore marked
--    approximated, and the sales-cycle chart ignores them rather than reporting
--    an average built on the day somebody last edited the record.
INSERT INTO "ProjectStatusEvent" ("id", "projectId", "pipeline", "fromStatus", "toStatus", "reason", "changedAt", "approximated")
SELECT 'pse_' || md5("id" || ':PROCUREMENT:closed'), "id", 'PROCUREMENT', 'OPEN',
       "procurementStatus", "procurementStatusReason", "updatedAt", true
  FROM "Project"
 WHERE "procurementStatus" IS NOT NULL
   AND "procurementStatus" <> 'OPEN'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ProjectStatusEvent" ("id", "projectId", "pipeline", "fromStatus", "toStatus", "reason", "changedAt", "approximated")
SELECT 'pse_' || md5("id" || ':DESIGN:closed'), "id", 'DESIGN', 'OPEN',
       "designStatus", "designStatusReason", "updatedAt", true
  FROM "Project"
 WHERE "serviceType" IN ('fullDesign', 'designAssist')
   AND "designStatus" IS NOT NULL
   AND "designStatus" <> 'OPEN'
ON CONFLICT ("id") DO NOTHING;
