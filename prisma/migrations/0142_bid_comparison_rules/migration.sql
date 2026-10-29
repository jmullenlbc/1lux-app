-- 0138: Bid Comparison rules staff edit on screen (Mike 10-22). Additive only.
-- New tables: FixtureKind, FixtureKindWord, BrandGrade. Empty tables mean the
-- code defaults in src/lib/bidComparison/kinds.js; the first edit copies them in.

-- CreateTable
CREATE TABLE "FixtureKind" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sizeUnit" TEXT,
    "sizeMin" DOUBLE PRECISION,
    "sizeMax" DOUBLE PRECISION,
    "sageOnly" BOOLEAN NOT NULL DEFAULT false,
    "noTypical" BOOLEAN NOT NULL DEFAULT false,
    "builderNote" TEXT NOT NULL DEFAULT '',
    "specNote" TEXT NOT NULL DEFAULT '',
    "builderLow" DOUBLE PRECISION,
    "builderHigh" DOUBLE PRECISION,
    "specLow" DOUBLE PRECISION,
    "specHigh" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'DEFAULT',
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixtureKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixtureKindWord" (
    "id" TEXT NOT NULL,
    "kindId" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FixtureKindWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandGrade" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "grade" TEXT,
    "sage" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "source" TEXT NOT NULL DEFAULT 'DEFAULT',
    "confidence" DOUBLE PRECISION,
    "note" TEXT NOT NULL DEFAULT '',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandGrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixtureKind_key_key" ON "FixtureKind"("key");

-- CreateIndex
CREATE INDEX "FixtureKind_sortOrder_idx" ON "FixtureKind"("sortOrder");

-- CreateIndex
CREATE INDEX "FixtureKindWord_phrase_idx" ON "FixtureKindWord"("phrase");

-- CreateIndex
CREATE UNIQUE INDEX "FixtureKindWord_kindId_list_phrase_key" ON "FixtureKindWord"("kindId", "list", "phrase");

-- CreateIndex
CREATE UNIQUE INDEX "BrandGrade_brand_key" ON "BrandGrade"("brand");

-- CreateIndex
CREATE INDEX "BrandGrade_status_idx" ON "BrandGrade"("status");

-- CreateIndex
CREATE INDEX "BrandGrade_sage_idx" ON "BrandGrade"("sage");

-- AddForeignKey
ALTER TABLE "FixtureKind" ADD CONSTRAINT "FixtureKind_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureKindWord" ADD CONSTRAINT "FixtureKindWord_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "FixtureKind"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandGrade" ADD CONSTRAINT "BrandGrade_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

