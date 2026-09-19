-- 0091 — two additive Project columns for Maram's CRM list (2026-09-18).
--
-- expectedContractExecutionDate: the day the contract is signed. Sits above
-- Expected Order Date in the pipeline popup (Maram 9-17).
-- projectSubtype: the sub-type under Project Type — a BUILDING_TYPES key from
-- src/lib/utils.js (garden, wrap, podium …); the pickers offer that fixed list.
--
-- Purely additive: two nullable columns, no defaults, no backfill, nothing
-- dropped or renamed. Safe to run against live data.
ALTER TABLE "Project" ADD COLUMN "expectedContractExecutionDate" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "projectSubtype" TEXT;
