-- LUNCH becomes MEAL.
--
-- Mike, 2026-09-07: "change to meals and include work breakfast, lunch and
-- dinners." One category now covers all three, so every note and every
-- classification rule that still says LUNCH is rewritten to MEAL.
--
-- Safe to run twice: after the first pass there are no LUNCH rows left, so the
-- second pass updates nothing. PostgreSQL-compatible, no schema change — both
-- columns are plain text.

UPDATE "Note"
   SET "activityType" = 'MEAL'
 WHERE "activityType" IN ('LUNCH', 'DINNER', 'BREAKFAST');

UPDATE "ActivityClassificationRule"
   SET "resultType" = 'MEAL'
 WHERE "resultType" IN ('LUNCH', 'DINNER', 'BREAKFAST');

-- The two seeded skip rules used to outrank every title rule, which threw away
-- a lunch that had a Teams link on the invite and any networking event with 15
-- or more people. Mike's rule is that a business title always counts, so they
-- drop below the title rules (50) rather than sitting above them.
UPDATE "ActivityClassificationRule"
   SET "priority" = 30
 WHERE "name" = 'Virtual — skip' AND "priority" = 80;

UPDATE "ActivityClassificationRule"
   SET "priority" = 25
 WHERE "name" = 'Large group — skip' AND "priority" = 70;
