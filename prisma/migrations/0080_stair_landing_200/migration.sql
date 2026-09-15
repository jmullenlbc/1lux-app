-- 0080: stair landings $175 → $200 on the live master pricing sheet.
--
-- Mike 2026-09-14: "regular stairwell = $200/landing (Up from $175/landing.
-- We have seen a cost increase we need to change in master pricing)".
--
-- Why a migration and not just the code default: the saved master sheet
-- (SystemConfig key 'pricing') holds the WHOLE merged sheet, so its 175 wins
-- over the new 200 in src/lib/pricing.js. This sets the saved value to 200
-- whatever it reads now — Mike 2026-09-15: "We just need the master pricing
-- inside the live app to show $200 for stairwells."
--
-- Not touched: each project's frozen pricingSnapshot. Saved budgets keep the
-- price they were built on.
--
-- The small/long breezeway multipliers are NEW keys; loadPricing() fills them
-- from the code default, so they need no data change here. An old
-- corridors.breezewayLandingMultiplier left in the saved sheet is ignored.
--
-- Guarded: if the saved value is not valid JSON, log a notice and leave it
-- rather than fail the deploy. Safe to run twice.
DO $$
BEGIN
  UPDATE "SystemConfig"
     SET "value"     = jsonb_set("value"::jsonb, '{corridors,stairwellPerLanding,product}', '200'::jsonb)::text,
         "updatedAt" = CURRENT_TIMESTAMP
   WHERE "key" = 'pricing'
     AND ("value"::jsonb #> '{corridors,stairwellPerLanding}') IS NOT NULL
     AND ("value"::jsonb #>> '{corridors,stairwellPerLanding,product}') IS DISTINCT FROM '200';
EXCEPTION WHEN others THEN
  RAISE NOTICE '0080: master pricing sheet left as is (%)', SQLERRM;
END $$;
