-- Frozen freight and warehousing rates on change orders and saved budget versions,
-- the same way sales tax froze in 0150. Additive only, and only the new columns are filled.
ALTER TABLE "ChangeOrder" ADD COLUMN "freightPct" DOUBLE PRECISION;
ALTER TABLE "ChangeOrder" ADD COLUMN "warehousingPct" DOUBLE PRECISION;
ALTER TABLE "DesignBidMatrix" ADD COLUMN "freightPct" DOUBLE PRECISION;
ALTER TABLE "DesignBidMatrix" ADD COLUMN "warehousingPct" DOUBLE PRECISION;

-- Existing versions and sent or approved change orders keep today's rate from here on.
-- Drafts stay blank and follow the job until they are sent.
UPDATE "DesignBidMatrix" m SET "freightPct" = COALESCE(pd."freightPct", 0.06), "warehousingPct" = COALESCE(pd."warehousingPct", 0.03) FROM "ProjectData" pd WHERE pd."projectId" = m."projectId";
UPDATE "ChangeOrder" c SET "freightPct" = COALESCE(pd."freightPct", 0.06), "warehousingPct" = COALESCE(pd."warehousingPct", 0.03) FROM "ProjectData" pd WHERE pd."projectId" = c."projectId" AND c."status" <> 'DRAFT';

-- A job with no data row has been priced at the default rates.
UPDATE "DesignBidMatrix" SET "freightPct" = 0.06, "warehousingPct" = 0.03 WHERE "freightPct" IS NULL;
UPDATE "ChangeOrder" SET "freightPct" = 0.06, "warehousingPct" = 0.03 WHERE "freightPct" IS NULL AND "status" <> 'DRAFT';
