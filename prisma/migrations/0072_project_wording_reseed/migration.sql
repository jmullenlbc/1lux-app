-- 0072 — one word for the thing we sell: "project", never "deal".
--
-- Mike, 2026-09-09: "reseed with project or projects instead of deal or deals.
-- we need 1 terminology for this."
--
-- The screens were changed to say Project in the last release, but four pieces
-- of wording were not on a screen — they were written into the database the
-- first time the app ran and have been sitting there ever since. Changing the
-- code does not change a row that already exists, so this changes the rows.
--
-- Data only. No table, column or index is touched, so nothing can be lost.
-- Every statement is a plain rename that matches on the old text, so running
-- it a second time simply finds nothing and does nothing.

-- The follow-up reminder tier shown on a client: "Active Deal" → "Active Project".
UPDATE "RelationshipCadenceRule"
   SET "label" = 'Active Project'
 WHERE "label" = 'Active Deal';

-- Starter chart titles on the Main / Sales / Pre-Con dashboards.
UPDATE "DashboardWidget"
   SET "name" = 'Open Projects by Organization'
 WHERE "name" = 'Open Deals by Organization';

UPDATE "DashboardWidget"
   SET "name" = 'Projects by Service Type'
 WHERE "name" = 'Deals by Service Type';

UPDATE "DashboardWidget"
   SET "name" = 'Lost Project Analysis'
 WHERE "name" = 'Lost Deal Analysis';

UPDATE "DashboardWidget"
   SET "name" = 'Projects Won by Owner'
 WHERE "name" = 'Deals Won by Owner';
