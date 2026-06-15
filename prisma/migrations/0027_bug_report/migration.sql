-- Migration 0027: create BugReport table
-- Mike added the BugReport model + two User relations
-- (BugReportReporter, BugReportAssignee) on June 9 with the QC bug
-- tracker commit b7187d8, applied locally via `prisma db push`, but
-- never generated a migration. Without this, the QC bug tracker API
-- routes would crash in production with P2021 even after the build
-- recovers from the RoadmapPriority issue (0026).
--
-- Caught by check-schema-migrations-sync.js the first time it ran.

CREATE TABLE "BugReport" (
    "id"            TEXT         NOT NULL PRIMARY KEY,
    "title"         TEXT         NOT NULL,
    "description"   TEXT         NOT NULL DEFAULT '',
    "status"        TEXT         NOT NULL DEFAULT 'NEW',
    "severity"      TEXT         NOT NULL DEFAULT 'MAJOR',
    "module"        TEXT,
    "pageUrl"       TEXT,
    "projectId"     TEXT,
    "expectedText"  TEXT,
    "actualText"    TEXT,
    "screenshotKey" TEXT,
    "recordingKey"  TEXT,
    "consoleJson"   TEXT         NOT NULL DEFAULT '[]',
    "networkJson"   TEXT         NOT NULL DEFAULT '[]',
    "pageStateJson" TEXT,
    "browserInfo"   TEXT,
    "viewport"      TEXT,
    "reporterId"    TEXT         NOT NULL,
    "assigneeId"    TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BugReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id"),
    CONSTRAINT "BugReport_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX "BugReport_status_idx"     ON "BugReport"("status");
CREATE INDEX "BugReport_reporterId_idx" ON "BugReport"("reporterId");
CREATE INDEX "BugReport_assigneeId_idx" ON "BugReport"("assigneeId");
