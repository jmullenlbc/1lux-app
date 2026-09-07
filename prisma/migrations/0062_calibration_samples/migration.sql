-- Pricing calibration samples (learning loop, 2026-09-04): one row per budget
-- line per capture — engine amount / quantity / rate beside the actual figure
-- when one is known. Read by the Pre-Con dashboard calibration widgets.
-- Purely additive; no existing table changes.
CREATE TABLE "CalibrationSample" (
  "id"              TEXT NOT NULL,
  "projectId"       TEXT NOT NULL,
  "source"          TEXT NOT NULL,
  "lineKey"         TEXT NOT NULL,
  "quantity"        DOUBLE PRECISION,
  "quantityUnit"    TEXT,
  "modelAmount"     DOUBLE PRECISION NOT NULL,
  "actualAmount"    DOUBLE PRECISION,
  "rateUsed"        DOUBLE PRECISION,
  "impliedRate"     DOUBLE PRECISION,
  "buildingType"    TEXT,
  "siteDesignLevel" TEXT,
  "note"            TEXT,
  "capturedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CalibrationSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalibrationSample_projectId_idx" ON "CalibrationSample"("projectId");

-- CreateIndex
CREATE INDEX "CalibrationSample_lineKey_idx" ON "CalibrationSample"("lineKey");

-- CreateIndex
CREATE INDEX "CalibrationSample_capturedAt_idx" ON "CalibrationSample"("capturedAt");

-- AddForeignKey
ALTER TABLE "CalibrationSample"
  ADD CONSTRAINT "CalibrationSample_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
