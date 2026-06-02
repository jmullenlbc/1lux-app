-- CreateTable
CREATE TABLE "FixtureScheduleShare" (
    "id"           TEXT NOT NULL,
    "projectId"    TEXT NOT NULL,
    "token"        TEXT NOT NULL,
    "permission"   TEXT NOT NULL DEFAULT 'view',
    "createdById"  TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3),

    CONSTRAINT "FixtureScheduleShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixtureScheduleShare_token_key" ON "FixtureScheduleShare"("token");
CREATE INDEX "FixtureScheduleShare_projectId_idx" ON "FixtureScheduleShare"("projectId");

ALTER TABLE "FixtureScheduleShare" ADD CONSTRAINT "FixtureScheduleShare_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixtureScheduleShare" ADD CONSTRAINT "FixtureScheduleShare_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
