-- Measured relationship cadences.
--
-- The five cadence tiers were seeded with placeholder day counts (42/90/90/180/365).
-- Mike asked what the real "went quiet" number is, so it was measured from four
-- years of his own calendar: every gap between two meetings with the same company
-- — 5,353 gaps across 434 companies, each one a gap the relationship SURVIVED
-- because another meeting followed it.
--
--   half of survived gaps <= 14 days · 80% <= 28 days · 90% <= 70 days
--
-- His real rhythm is two weeks, so the three short tiers were far too loose: a
-- deal you are actively working should not be allowed a full quarter of silence.
-- The two long tiers held up and are left alone.
--
-- Deliberately conditional on the old placeholder value. A tier somebody has
-- already tuned by hand keeps their number — this only moves rows nobody touched.
-- No schema change: data only.

UPDATE "RelationshipCadenceRule" SET "cadenceDays" = 30, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "tier" = 'VIP_CLIENT'    AND "cadenceDays" = 42;

UPDATE "RelationshipCadenceRule" SET "cadenceDays" = 45, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "tier" = 'ACTIVE_DEAL'   AND "cadenceDays" = 90;

UPDATE "RelationshipCadenceRule" SET "cadenceDays" = 75, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "tier" = 'WARM_PROSPECT' AND "cadenceDays" = 90;
