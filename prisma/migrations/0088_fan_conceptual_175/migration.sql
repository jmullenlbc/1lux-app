-- 0088: conceptual fan price $180 → $175 GROSS on the live master pricing sheet.
--
-- Mike 2026-09-16, reconciling Lone Tree Ranch against his own sheet: "keep
-- $175 for fans on the gross number for the master pricing sheet" and "There
-- shouldn't be a coded price for fans. It should always pull from the master
-- pricing sheet and should be $175 entered in there."
--
-- Why a migration and not just the code default (same reason as 0080): the
-- saved master sheet (SystemConfig key 'pricing') holds the WHOLE merged
-- sheet, so a saved 180 wins over the new 175 in src/lib/pricing.js. This
-- sets the saved value to 175 whatever it reads now. The engine takes the
-- $35 disk credit off it: $175 − $35 = $140 net per fan.
--
-- Not touched: each project's frozen pricingSnapshot. Saved budgets keep the
-- price they were built on (Mike: no re-run of old jobs).
--
-- corridors.maxPctOfGross (the new corridor cap) is a NEW key; loadPricing()
-- fills it from the code default, so it needs no data change here.
--
-- Guarded: if the saved value is not valid JSON, log a notice and leave it
-- rather than fail the deploy. Safe to run twice.
DO $$
BEGIN
  UPDATE "SystemConfig"
     SET "value"     = jsonb_set("value"::jsonb, '{fans,conceptualPerFan}', '175'::jsonb)::text,
         "updatedAt" = CURRENT_TIMESTAMP
   WHERE "key" = 'pricing'
     AND ("value"::jsonb #> '{fans}') IS NOT NULL
     AND ("value"::jsonb #>> '{fans,conceptualPerFan}') IS DISTINCT FROM '175';
EXCEPTION WHEN others THEN
  RAISE NOTICE '0088: master pricing sheet left as is (%)', SQLERRM;
END $$;
