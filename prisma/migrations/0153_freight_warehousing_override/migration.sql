-- Manual freight and warehousing: flat dollars on a job and its saved versions,
-- dollars or percent on a change order option. Additive only.
ALTER TABLE "ProjectData"
  ADD COLUMN "freightOverride" DOUBLE PRECISION,
  ADD COLUMN "warehousingOverride" DOUBLE PRECISION;

ALTER TABLE "DesignBidMatrix"
  ADD COLUMN "freightOverride" DOUBLE PRECISION,
  ADD COLUMN "warehousingOverride" DOUBLE PRECISION;

ALTER TABLE "ChangeOrderOptionGroup"
  ADD COLUMN "freightOverride" DOUBLE PRECISION,
  ADD COLUMN "freightOverridePct" DOUBLE PRECISION,
  ADD COLUMN "warehousingOverride" DOUBLE PRECISION,
  ADD COLUMN "warehousingOverridePct" DOUBLE PRECISION;
