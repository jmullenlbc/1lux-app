-- Two changes, Mike 2026-09-12. Purely additive: nothing is dropped, renamed or
-- rewritten. User.division and User.deptRoles stay in the database untouched;
-- the app just stops reading them.
--
-- 1. Bug reports are archived, never deleted ("Yes" to making QC bug reports
--    archive-only). The screenshot and recording in S3 are kept too.
ALTER TABLE "BugReport" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "BugReport" ADD COLUMN "archivedById" TEXT;
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Every user can belong to several departments ("It should be a multi
--    select. Sales + marketing / Operations / Pre-construction / Construction /
--    Project management / Design / Finance"). One row per person per
--    department, so "who is in Sales" is a plain query. Keys live in
--    src/lib/departments.js.
CREATE TABLE "UserDepartment" (
    "userId"     TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserDepartment_pkey" PRIMARY KEY ("userId", "department")
);
CREATE INDEX "UserDepartment_department_idx" ON "UserDepartment"("department");
ALTER TABLE "UserDepartment" ADD CONSTRAINT "UserDepartment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over what people already had: the one-per-person division and the
-- department tags (a JSON list of labels). Sales becomes Sales + marketing;
-- Project management is new, so nobody starts in it. DISTINCT because someone
-- in the SALES division who was also tagged "Sales" would otherwise be
-- inserted twice in this one statement.
-- The tags are matched as plain text ("Sales" in quotes anywhere in the
-- value), never parsed as JSON: a hand-edited value that isn't valid JSON
-- would otherwise stop the whole deploy at this migration.
INSERT INTO "UserDepartment" ("userId", "department")
SELECT DISTINCT picked."userId", picked."department"
FROM (
  SELECT u."id" AS "userId",
         CASE u."division"
           WHEN 'SALES'           THEN 'SALES_MARKETING'
           WHEN 'OPERATIONS'      THEN 'OPERATIONS'
           WHEN 'PRECONSTRUCTION' THEN 'PRECONSTRUCTION'
           WHEN 'CONSTRUCTION'    THEN 'CONSTRUCTION'
           WHEN 'FINANCE'         THEN 'FINANCE'
         END AS "department"
  FROM "User" u
  UNION ALL
  SELECT u."id", tag."department"
  FROM "User" u
  JOIN (VALUES
    ('Sales',            'SALES_MARKETING'),
    ('Operations',       'OPERATIONS'),
    ('Pre-construction', 'PRECONSTRUCTION'),
    ('Construction',     'CONSTRUCTION'),
    ('Design',           'DESIGN'),
    ('Finance',          'FINANCE')
  ) AS tag("label", "department")
    ON COALESCE(u."deptRoles", '') LIKE ('%"' || tag."label" || '"%')
) picked
WHERE picked."department" IS NOT NULL
ON CONFLICT DO NOTHING;
