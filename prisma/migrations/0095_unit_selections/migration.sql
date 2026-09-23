-- Unit Selections.
--
-- Six tables that turn the five-fixture decorative argument (island pendant,
-- bath vanity, balcony sconce, unit-entry sconce, ceiling fan) into records.
--
-- Two things to know before editing any of this:
--   * "DecorativeOptionFinish"."dnPrice" is the buy price. It is internal, and
--     the public share routes select their columns by name so it can never be
--     handed out by a careless include.
--   * "UnitSelectionResult"."agreement" is the point of the whole feature.
--     Nothing here averages three people's answers into one — DIVERGENT is a
--     real outcome that a person then resolves.

CREATE TABLE "DecorativeOption" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bodyKey" TEXT NOT NULL,
    "shape" TEXT NOT NULL DEFAULT '',
    "style" TEXT NOT NULL DEFAULT '',
    "dimLabel" TEXT NOT NULL DEFAULT '',
    "projectionIn" DOUBLE PRECISION,
    "bladeSpanIn" DOUBLE PRECISION,
    "wetRated" BOOLEAN NOT NULL DEFAULT false,
    "dampRated" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecorativeOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DecorativeOption_category_isActive_idx" ON "DecorativeOption"("category", "isActive");

CREATE TABLE "DecorativeOptionFinish" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "finishKey" TEXT NOT NULL,
    "catalogNumber" TEXT,
    "manufacturer" TEXT,
    "productId" TEXT,
    "dnPrice" DOUBLE PRECISION,
    "cnPrice" DOUBLE PRECISION,
    "leadTimeWks" INTEGER,
    "imageUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecorativeOptionFinish_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DecorativeOptionFinish_optionId_finishKey_key"
    ON "DecorativeOptionFinish"("optionId", "finishKey");

CREATE TABLE "UnitSelectionSurvey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "factsSnapshot" TEXT NOT NULL DEFAULT '{}',
    "styleSeed" TEXT,
    "createdById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitSelectionSurvey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnitSelectionSurvey_projectId_version_key"
    ON "UnitSelectionSurvey"("projectId", "version");

CREATE TABLE "UnitSelectionResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "respondentName" TEXT NOT NULL,
    "respondentRole" TEXT NOT NULL,
    "contactId" TEXT,
    "shareToken" TEXT NOT NULL,
    "styleChoice" TEXT,
    "finishOverride" TEXT,
    "fanHoldWhite" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitSelectionResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnitSelectionResponse_shareToken_key" ON "UnitSelectionResponse"("shareToken");
CREATE INDEX "UnitSelectionResponse_surveyId_idx" ON "UnitSelectionResponse"("surveyId");

CREATE TABLE "UnitSelectionChoice" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "finishKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitSelectionChoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnitSelectionChoice_responseId_category_optionId_key"
    ON "UnitSelectionChoice"("responseId", "category", "optionId");

CREATE TABLE "UnitSelectionResult" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "finishKey" TEXT NOT NULL,
    "agreement" TEXT NOT NULL,
    "divergence" TEXT NOT NULL DEFAULT '[]',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "note" TEXT,
    "pushedAt" TIMESTAMP(3),
    "pushedItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitSelectionResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnitSelectionResult_surveyId_category_key"
    ON "UnitSelectionResult"("surveyId", "category");

ALTER TABLE "DecorativeOptionFinish" ADD CONSTRAINT "DecorativeOptionFinish_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "DecorativeOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnitSelectionSurvey" ADD CONSTRAINT "UnitSelectionSurvey_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnitSelectionResponse" ADD CONSTRAINT "UnitSelectionResponse_surveyId_fkey"
    FOREIGN KEY ("surveyId") REFERENCES "UnitSelectionSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnitSelectionChoice" ADD CONSTRAINT "UnitSelectionChoice_responseId_fkey"
    FOREIGN KEY ("responseId") REFERENCES "UnitSelectionResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnitSelectionChoice" ADD CONSTRAINT "UnitSelectionChoice_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "DecorativeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UnitSelectionResult" ADD CONSTRAINT "UnitSelectionResult_surveyId_fkey"
    FOREIGN KEY ("surveyId") REFERENCES "UnitSelectionSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnitSelectionResult" ADD CONSTRAINT "UnitSelectionResult_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "DecorativeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
