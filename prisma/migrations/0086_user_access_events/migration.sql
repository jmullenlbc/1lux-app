-- 0086: access history.
--
-- One row per change to someone's access — account created, name, role, turned
-- off or back on, a department added or removed, an extra permission switched,
-- a password reset by an admin (the password itself is never stored here).
-- Written by /api/admin/users and /api/admin/users/[id] in the same transaction
-- as the change. Rows are never deleted (src/lib/archive.js NEVER_DELETED).
--
-- Additive only: a new table, nothing existing is touched. History starts the
-- day this ships; changes made before it were never recorded anywhere.
CREATE TABLE "UserAccessEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "field" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT,

    CONSTRAINT "UserAccessEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserAccessEvent_userId_changedAt_idx" ON "UserAccessEvent"("userId", "changedAt");
CREATE INDEX "UserAccessEvent_changedAt_idx" ON "UserAccessEvent"("changedAt");

ALTER TABLE "UserAccessEvent" ADD CONSTRAINT "UserAccessEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserAccessEvent" ADD CONSTRAINT "UserAccessEvent_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
