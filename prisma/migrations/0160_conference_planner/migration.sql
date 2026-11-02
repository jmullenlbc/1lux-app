-- Conference planner (Mike 11-1): new tables, plus a home city and state on each
-- user. Nothing existing changes.
ALTER TABLE "User" ADD COLUMN "homeCity" TEXT;
ALTER TABLE "User" ADD COLUMN "homeState" TEXT;

CREATE TABLE "ConferenceSeries" (
    "id" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizer" TEXT,
    "vertical" TEXT NOT NULL,
    "format" TEXT,
    "audience" TEXT,
    "description" TEXT,
    "url" TEXT,
    "accessRoute" TEXT NOT NULL DEFAULT 'TICKET',
    "supplierEligible" BOOLEAN NOT NULL DEFAULT true,
    "regCostPerCompany" BOOLEAN NOT NULL DEFAULT false,
    "membershipRequired" TEXT,
    "supplierRestrictions" TEXT,
    "buyerDensity" INTEGER NOT NULL DEFAULT 3,
    "supplierAccess" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConferenceSeries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConferenceSeries_slug_key" ON "ConferenceSeries"("slug");
CREATE INDEX "ConferenceSeries_vertical_idx" ON "ConferenceSeries"("vertical");

CREATE TABLE "ConferenceSeriesTag" (
    "seriesId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    CONSTRAINT "ConferenceSeriesTag_pkey" PRIMARY KEY ("seriesId", "tag")
);
CREATE INDEX "ConferenceSeriesTag_tag_idx" ON "ConferenceSeriesTag"("tag");

CREATE TABLE "ConferenceEdition" (
    "id" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "key" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "planYear" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "dateStatus" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "priorDates" TEXT,
    "city" TEXT,
    "state" TEXT,
    "region" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'NATIONAL',
    "isLocal" BOOLEAN NOT NULL DEFAULT false,
    "attendance" INTEGER,
    "regCostCents" INTEGER,
    "regCostBasis" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "regCostDetail" TEXT,
    "earlyBirdDeadline" TIMESTAMP(3),
    "sponsorMinText" TEXT,
    "hotelRateOverrideCents" INTEGER,
    "airfareOverrideCents" INTEGER,
    "researchNotes" TEXT,
    "addedFrom" TEXT,
    "tierOverride" TEXT,
    "includeOverride" BOOLEAN,
    "headcountOverride" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'CONSIDERING',
    "ownerId" TEXT,
    "planNotes" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConferenceEdition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConferenceEdition_key_key" ON "ConferenceEdition"("key");
CREATE INDEX "ConferenceEdition_planYear_startDate_idx" ON "ConferenceEdition"("planYear", "startDate");
CREATE INDEX "ConferenceEdition_seriesId_idx" ON "ConferenceEdition"("seriesId");
CREATE INDEX "ConferenceEdition_ownerId_idx" ON "ConferenceEdition"("ownerId");

CREATE TABLE "ConferenceEditionSource" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    CONSTRAINT "ConferenceEditionSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConferenceEditionSource_editionId_url_key" ON "ConferenceEditionSource"("editionId", "url");

CREATE TABLE "ConferencePlan" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "budgetCapCents" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConferencePlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConferencePlan_year_key" ON "ConferencePlan"("year");

CREATE TABLE "ConferencePlanSetting" (
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "ConferencePlanSetting_pkey" PRIMARY KEY ("planId", "key")
);

CREATE TABLE "ConferenceMembership" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "orgName" TEXT NOT NULL,
    "annualDuesCents" INTEGER,
    "include" TEXT NOT NULL DEFAULT 'N',
    "renewalDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConferenceMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConferenceMembership_year_orgName_key" ON "ConferenceMembership"("year", "orgName");

CREATE TABLE "ConferenceMembershipSeries" (
    "membershipId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    CONSTRAINT "ConferenceMembershipSeries_pkey" PRIMARY KEY ("membershipId", "seriesId")
);
CREATE INDEX "ConferenceMembershipSeries_seriesId_idx" ON "ConferenceMembershipSeries"("seriesId");

ALTER TABLE "ConferenceSeriesTag" ADD CONSTRAINT "ConferenceSeriesTag_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ConferenceSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConferenceEdition" ADD CONSTRAINT "ConferenceEdition_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ConferenceSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConferenceEdition" ADD CONSTRAINT "ConferenceEdition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConferenceEditionSource" ADD CONSTRAINT "ConferenceEditionSource_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "ConferenceEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConferencePlanSetting" ADD CONSTRAINT "ConferencePlanSetting_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ConferencePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConferenceMembershipSeries" ADD CONSTRAINT "ConferenceMembershipSeries_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ConferenceMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConferenceMembershipSeries" ADD CONSTRAINT "ConferenceMembershipSeries_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ConferenceSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
