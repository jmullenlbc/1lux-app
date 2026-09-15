-- Project management folds into Construction (Mike, 2026-09-14: "Project
-- management and construction are the same department", and the merged one is
-- called "no just construction"). Data only — no table or column changes.
--
-- Everyone in Project management is moved into Construction by relabelling
-- their row, so the date they joined is kept. Nothing is deleted: someone who
-- was already in both keeps their Construction row, and their old Project
-- management row is left where it is. The app ignores that leftover row
-- (src/lib/departments.js only knows the six current keys), and it disappears
-- the next time an admin saves that person's departments.
--
-- Written so the same statement runs on Postgres and on the local SQLite copy.
UPDATE "UserDepartment"
SET "department" = 'CONSTRUCTION'
WHERE "department" = 'PROJECT_MANAGEMENT'
  AND NOT EXISTS (
    SELECT 1 FROM "UserDepartment" AS c
    WHERE c."userId" = "UserDepartment"."userId"
      AND c."department" = 'CONSTRUCTION'
  );
