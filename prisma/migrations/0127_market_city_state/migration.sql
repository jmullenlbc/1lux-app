-- 0127: city and state as their own columns on a signal (Mike 10-8: "Show
-- city and state, but those should be tracked as different fields and combined
-- visually"). Additive only. Filled from the METRO ("Austin, TX") and STATE
-- ("TX") tag rows every signal already carries; kept in step by saveSignalTags.
ALTER TABLE "MarketSignal" ADD COLUMN "city" TEXT;
ALTER TABLE "MarketSignal" ADD COLUMN "state" TEXT;

CREATE INDEX "MarketSignal_state_city_idx" ON "MarketSignal"("state", "city");

UPDATE "MarketSignal" s
SET "city"  = NULLIF(trim(split_part(t."name", ',', 1)), ''),
    "state" = NULLIF(trim(split_part(t."name", ',', 2)), '')
FROM "MarketSignalTag" l
JOIN "MarketTag" t ON t."id" = l."tagId" AND t."kind" = 'METRO'
WHERE l."signalId" = s."id" AND s."city" IS NULL;

UPDATE "MarketSignal" s
SET "state" = t."name"
FROM "MarketSignalTag" l
JOIN "MarketTag" t ON t."id" = l."tagId" AND t."kind" = 'STATE'
WHERE l."signalId" = s."id" AND s."state" IS NULL;
