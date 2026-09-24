-- Mike 2026-09-24: the sheet-wide controls cap is $190K, not $180K.
-- The master pricing sheet is stored whole in SystemConfig('pricing'), so
-- changing the default in src/lib/pricing.js never reaches a saved sheet.
-- Data only; touches the row only if it still holds the old $180K.
UPDATE "SystemConfig"
SET "value" = jsonb_set("value"::jsonb, '{controls,cap}', '190000')::text,
    "updatedAt" = NOW()
WHERE "key" = 'pricing'
  AND ("value"::jsonb #>> '{controls,cap}') = '180000';
